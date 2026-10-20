import { NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import * as dayjs from 'dayjs';
import { BillingEnabledGuard } from './billing-enabled.guard';
import { OmiseService } from '../omise/omise.service';
import { OrganizationSubscriptionCron } from '../organization-subscription/organization-subscription.cron';
import { OrganizationSubscriptionService } from '../organization-subscription/organization-subscription.service';

const withBilling = (value: string | undefined, run: () => unknown) => {
  const before = process.env.BILLING_ENABLED;
  if (value === undefined) delete process.env.BILLING_ENABLED;
  else process.env.BILLING_ENABLED = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.BILLING_ENABLED;
    else process.env.BILLING_ENABLED = before;
  }
};

describe('BillingEnabledGuard', () => {
  const guard = new BillingEnabledGuard();

  it('404 when BILLING_ENABLED is unset (default off)', () => {
    withBilling(undefined, () =>
      expect(() => guard.canActivate()).toThrow(NotFoundException),
    );
  });

  it('passes only when BILLING_ENABLED=true', () => {
    withBilling('true', () => expect(guard.canActivate()).toBe(true));
    withBilling('1', () =>
      expect(() => guard.canActivate()).toThrow(NotFoundException),
    );
  });
});

describe('OrganizationSubscriptionCron lock', () => {
  const makeCron = (locked: boolean) => {
    const service = { changeCycleSubscription: jest.fn() };
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ locked }]) };
    const prisma = {
      $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const cron = new OrganizationSubscriptionCron(
      service as never,
      prisma as never,
    );
    return { cron, service };
  };

  it('renews when this pod acquires the lock', async () => {
    const { cron, service } = makeCron(true);
    await cron.handleSubscriptionRenewal();
    expect(service.changeCycleSubscription).toHaveBeenCalledTimes(1);
  });

  it('skips when another pod holds the lock', async () => {
    const { cron, service } = makeCron(false);
    await cron.handleSubscriptionRenewal();
    expect(service.changeCycleSubscription).not.toHaveBeenCalled();
  });
});

describe('changeCycleSubscription with billing disabled', () => {
  const paidSub = (autoRenew: boolean) => ({
    id: 'sub-1',
    organizationId: 'org-1',
    price: 990,
    autoRenew,
    periodCount: 1,
    creditAllowance: 100,
    imageAllowance: 50,
  });

  const makeService = (
    sub: ReturnType<typeof paidSub> & Record<string, unknown>,
  ) => {
    const subRepo = {
      // ครั้งแรก = sub ที่ถึงวันต่ออายุ, รอบอื่น (period / cancel) = ว่าง
      findMany: jest.fn().mockResolvedValueOnce([sub]).mockResolvedValue([]),
      update: jest.fn(),
    };
    const creditRepo = { update: jest.fn() };
    const omise = { chargeCustomerCard: jest.fn() };
    const organizationRepo = { findOne: jest.fn(), update: jest.fn() };
    const planRepo = { findOne: jest.fn() };
    const planPriceRepo = { findOne: jest.fn() };
    const service = new OrganizationSubscriptionService(
      subRepo as never,
      creditRepo as never,
      planRepo as never,
      planPriceRepo as never,
      {} as never,
      organizationRepo as never,
      { create: jest.fn() } as never,
      omise as never,
      {} as never,
    );
    return {
      service,
      subRepo,
      creditRepo,
      omise,
      organizationRepo,
      planRepo,
      planPriceRepo,
    };
  };

  it.each(['pending_cancel', 'expired'])(
    'free plan in status %s → not rolled',
    async (status) => {
      const { service, subRepo, creditRepo } = makeService({
        ...paidSub(true),
        price: 0,
        status,
      });
      await service.changeCycleSubscription();
      expect(creditRepo.update).not.toHaveBeenCalled();
      expect(subRepo.update).not.toHaveBeenCalled();
    },
  );

  it('paid renewal keeps an org the admin switched off inactive', async () => {
    const { service, subRepo, omise, organizationRepo, planRepo, planPriceRepo } =
      makeService({ ...paidSub(true), status: 'active', nextPlanId: 'p', nextPlanPriceId: 'pp' });
    subRepo.update.mockResolvedValue({ organizationId: 'org-1' });
    organizationRepo.findOne.mockResolvedValue({ omiseCustomerId: 'cust' });
    omise.chargeCustomerCard.mockResolvedValue({ id: 'c', status: 'successful' });
    planRepo.findOne.mockResolvedValue({
      id: 'p',
      name: 'Pro',
      detailJson: { creditAllowance: 100, imageAllowance: 50, maxUserAccess: 5 },
    });
    planPriceRepo.findOne.mockResolvedValue({ id: 'pp', price: 990, periodCount: 1 });
    // configs() อ่าน env ระหว่าง await — withBilling คืนค่า env ก่อน promise จบ
    const before = process.env.BILLING_ENABLED;
    process.env.BILLING_ENABLED = 'true';
    try {
      await service.changeCycleSubscription();
    } finally {
      if (before === undefined) delete process.env.BILLING_ENABLED;
      else process.env.BILLING_ENABLED = before;
    }
    expect(omise.chargeCustomerCard).toHaveBeenCalled();
    expect(organizationRepo.update).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      data: { maxUserAccess: 5 },
    });
  });

  it('autoRenew on → rolls the cycle and resets credits without charging', async () => {
    const { service, subRepo, creditRepo, omise } = makeService(paidSub(true));
    await withBilling(undefined, () => service.changeCycleSubscription());
    expect(omise.chargeCustomerCard).not.toHaveBeenCalled();
    expect(creditRepo.update).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      data: { currentCycleBalance: 100, currentCycleImage: 50 },
    });
    const nextStart = dayjs().add(1, 'day').startOf('day');
    const update = subRepo.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'sub-1' });
    expect(dayjs(update.data.currentPeriodStart).startOf('day').valueOf()).toBe(
      nextStart.valueOf(),
    );
  });

  it('autoRenew off → leaves the subscription alone', async () => {
    const { service, subRepo, creditRepo, omise } = makeService(paidSub(false));
    await withBilling(undefined, () => service.changeCycleSubscription());
    expect(omise.chargeCustomerCard).not.toHaveBeenCalled();
    expect(creditRepo.update).not.toHaveBeenCalled();
    expect(subRepo.update).not.toHaveBeenCalled();
  });
});

describe('OmiseService.chargeCustomerCard', () => {
  it('sends the invoice number as Idempotency-Key', async () => {
    const before = process.env.OMISE_SECRET_KEY;
    process.env.OMISE_SECRET_KEY = 'skey_test';
    const http = { post: jest.fn().mockReturnValue(of({ data: { id: 'chrg' } })) };
    try {
      await new OmiseService(http as never).chargeCustomerCard({
        amountBaht: 10,
        customerId: 'cust',
        invoiceNo: 'RENEW-sub-1-20261012',
      });
    } finally {
      if (before === undefined) delete process.env.OMISE_SECRET_KEY;
      else process.env.OMISE_SECRET_KEY = before;
    }
    expect(http.post.mock.calls[0][2].headers['Idempotency-Key']).toBe(
      'RENEW-sub-1-20261012',
    );
  });
});
