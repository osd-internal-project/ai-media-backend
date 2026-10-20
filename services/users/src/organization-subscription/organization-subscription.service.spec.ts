import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  CreditBalanceRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PackageTransactionRepository,
  PlanPriceRepository,
  PlanRepository,
  PrismaService,
} from '@ai-media/share';
import { OmiseService } from '../omise/omise.service';
import { OrganizationSubscriptionService } from './organization-subscription.service';

const baseSub = {
  id: 'sub-1',
  organizationId: 'org-1',
  planId: 'plan-current',
  planName: 'Current',
  interval: 'MONTH',
  period: 'monthly',
  periodCount: 1,
  creditAllowance: 1000,
  imageAllowance: 50,
  nextPlanPriceId: 'price-current',
  nextBillingDate: new Date('2026-11-30T00:00:00Z'),
  status: 'active',
  autoRenew: true,
};

describe('OrganizationSubscriptionService', () => {
  let service: OrganizationSubscriptionService;
  const subscriptionRepo = { findOne: jest.fn(), update: jest.fn() };
  const planRepo = { findOne: jest.fn() };
  const planPriceRepo = { findOne: jest.fn() };
  const memberRepo = { findOne: jest.fn() };
  const tx = {
    creditBalance: { update: jest.fn() },
    organizationSubscription: { update: jest.fn() },
    organization: { update: jest.fn() },
    packageTransaction: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationSubscriptionService,
        { provide: OrganizationSubscriptionRepository, useValue: subscriptionRepo },
        { provide: PlanRepository, useValue: planRepo },
        { provide: PlanPriceRepository, useValue: planPriceRepo },
        { provide: OrganizationMemberRepository, useValue: memberRepo },
        { provide: PrismaService, useValue: prisma },
        ...[
          CreditBalanceRepository,
          OrganizationRepository,
          PackageTransactionRepository,
          OmiseService,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    }).compile();
    service = moduleRef.get(OrganizationSubscriptionService);
    subscriptionRepo.findOne.mockResolvedValue({ ...baseSub });
    planPriceRepo.findOne.mockResolvedValue({
      id: 'price-1',
      planId: 'plan-target',
      price: 990,
      interval: 'MONTH',
      periodCount: 1,
    });
  });

  describe('package status guard', () => {
    it('rejects upgrading to an inactive package', async () => {
      planRepo.findOne.mockResolvedValue({ id: 'plan-target', status: false });
      await expect(
        service.upgradeSubscription('org-1', 'price-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(subscriptionRepo.update).not.toHaveBeenCalled();
    });

    it('rejects downgrading to an inactive package', async () => {
      planRepo.findOne.mockResolvedValue({ id: 'plan-target', status: false });
      await expect(
        service.downgradeSubscription('org-1', 'price-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(subscriptionRepo.update).not.toHaveBeenCalled();
    });

    it('allows the org to stay on its current package after it was deactivated', async () => {
      planRepo.findOne.mockResolvedValue({ id: 'plan-current', status: false });
      await service.downgradeSubscription('org-1', 'price-1');
      expect(subscriptionRepo.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { nextPlanId: 'plan-current', nextPlanPriceId: 'price-1' },
      });
    });

    it('schedules an active package', async () => {
      planRepo.findOne.mockResolvedValue({ id: 'plan-target', status: true });
      await service.downgradeSubscription('org-1', 'price-1');
      expect(subscriptionRepo.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { nextPlanId: 'plan-target', nextPlanPriceId: 'price-1' },
      });
    });

    it('returns 404 instead of crashing when the price does not exist', async () => {
      planPriceRepo.findOne.mockResolvedValue(null);
      await expect(
        service.downgradeSubscription('org-1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('permissions', () => {
    it('allows only system admins on admin actions', () => {
      expect(() =>
        service.assertSuperAdmin({ userId: 'u', token: 't', role: 'USER' }),
      ).toThrow(ForbiddenException);
      expect(() => service.assertSuperAdmin(undefined)).toThrow(
        ForbiddenException,
      );
      expect(() =>
        service.assertSuperAdmin({ userId: 'u', token: 't', role: 'SUPER_ADMIN ' }),
      ).not.toThrow();
    });

    it('lets an org owner cancel but not a plain member', async () => {
      const user = { userId: 'u-1', token: 't', role: 'USER' };
      memberRepo.findOne.mockResolvedValueOnce({ role: 'OWNER' });
      await expect(
        service.assertOrganizationManager(user, 'org-1'),
      ).resolves.toBeUndefined();
      memberRepo.findOne.mockResolvedValueOnce({ role: 'MEMBER' });
      await expect(
        service.assertOrganizationManager(user, 'org-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      memberRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.assertOrganizationManager(user, 'org-2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('adminRenew', () => {
    beforeEach(() => {
      planPriceRepo.findOne.mockResolvedValue({
        id: 'price-current',
        planId: 'plan-current',
        periodCount: 3,
      });
    });

    it('extends an active subscription by one cycle without touching credit', async () => {
      await service.adminRenew('org-1');
      const { data } = tx.organizationSubscription.update.mock.calls[0][0];
      expect(data.status).toBe('active');
      expect(data.autoRenew).toBe(true);
      // 2026-12-01 + 3 months - 1 day
      expect(data.nextBillingDate.toISOString().slice(0, 10)).toBe('2027-02-28');
      expect(data.currentPeriodStart).toBeUndefined();
      expect(tx.creditBalance.update).not.toHaveBeenCalled();
      expect(tx.packageTransaction.create.mock.calls[0][0].data).toMatchObject({
        paymentMethod: 'admin_renewal',
        amountPaid: 0,
      });
    });

    it('restarts an expired subscription from today and refills its credit', async () => {
      subscriptionRepo.findOne.mockResolvedValue({ ...baseSub, status: 'expired', autoRenew: false });
      await service.adminRenew('org-1');
      expect(tx.creditBalance.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { currentCycleBalance: 1000, currentCycleImage: 50 },
      });
      const { data } = tx.organizationSubscription.update.mock.calls[0][0];
      expect(data).toMatchObject({ status: 'active', autoRenew: true, periodCurrent: 1 });
      expect(data.currentPeriodStart.toDateString()).toBe(new Date().toDateString());
    });

    it('falls back to the stored period when nextPlanPriceId belongs to another plan', async () => {
      planPriceRepo.findOne.mockResolvedValue({ id: 'x', planId: 'plan-other', periodCount: 12 });
      await service.adminRenew('org-1');
      const { data } = tx.organizationSubscription.update.mock.calls[0][0];
      expect(data.nextBillingDate.toISOString().slice(0, 10)).toBe('2026-12-31');
    });
  });

  describe('adminChangePackage', () => {
    it('switches plan, allowances, seats and credit immediately', async () => {
      planRepo.findOne.mockResolvedValue({
        id: 'plan-target',
        name: 'Pro',
        status: true,
        detailJson: { creditAllowance: 5000, imageAllowance: '200', maxUserAccess: 10 },
      });
      await service.adminChangePackage('org-1', 'price-1');
      expect(tx.organizationSubscription.update.mock.calls[0][0].data).toMatchObject({
        planId: 'plan-target',
        planName: 'Pro',
        creditAllowance: 5000,
        imageAllowance: 200,
        nextPlanId: 'plan-target',
        nextPlanPriceId: 'price-1',
      });
      expect(tx.creditBalance.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { currentCycleBalance: 5000, currentCycleImage: 200 },
      });
      expect(tx.organization.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { maxUserAccess: 10 },
      });
    });

    it('asks for a renewal first when the subscription expired', async () => {
      subscriptionRepo.findOne.mockResolvedValue({ ...baseSub, status: 'expired' });
      await expect(
        service.adminChangePackage('org-1', 'price-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an inactive package', async () => {
      planRepo.findOne.mockResolvedValue({ id: 'plan-target', status: false });
      await expect(
        service.adminChangePackage('org-1', 'price-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('adminCancel / adminResume', () => {
    it('cancels at the end of the period', async () => {
      await service.adminCancel('org-1', 'end_of_period');
      expect(subscriptionRepo.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { autoRenew: false, status: 'pending_cancel' },
      });
      expect(tx.creditBalance.update).not.toHaveBeenCalled();
    });

    it('cancels immediately and clears only the cycle credit', async () => {
      await service.adminCancel('org-1', 'immediate');
      expect(tx.creditBalance.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { currentCycleBalance: 0, currentCycleImage: 0 },
      });
      expect(tx.organizationSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'expired', autoRenew: false },
      });
    });

    it('resumes a pending cancellation', async () => {
      subscriptionRepo.findOne.mockResolvedValue({ ...baseSub, status: 'pending_cancel' });
      await service.adminResume('org-1');
      expect(subscriptionRepo.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { status: 'active', autoRenew: true },
      });
    });

    it('refuses to resume an active subscription', async () => {
      await expect(service.adminResume('org-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
