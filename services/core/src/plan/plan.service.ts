import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OrganizationRepository,
  PlanRepository,
  PlanPriceRepository,
  PrismaTransactionService,
  TQueryClient,
  AuditLogRepository,
  AuthUser,
  changedFields,
  recordAdminAudit,
  matchesPlan,
  OrgEntitlements,
} from '@ai-media/share';
import { parseApplyScope, pickTargets } from './plan-apply';
import { Prisma } from '@prisma/client';
import { access } from 'fs';

@Injectable()
export class PlanService {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly planPriceRepo: PlanPriceRepository,
    private readonly organizationRepo: OrganizationRepository,
    private readonly transaction: PrismaTransactionService,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  /** org ที่ใช้ plan นี้: subscription ชี้ plan นี้ + (ถ้าเป็น plan ค่าเริ่มต้น) org personal ที่ไม่มี subscription */
  private organizationsUsing(
    planId: string,
    isDefault: boolean,
    prisma?: TQueryClient,
  ): Promise<OrgEntitlements[]> {
    return this.organizationRepo.findMany(
      {
        where: {
          OR: [
            { subscription: { is: { planId } } },
            ...(isDefault
              ? [{ type: { equals: 'personal', mode: 'insensitive' as const }, subscription: { is: null } }]
              : []),
          ],
        },
        select: { organizationId: true, accessCodes: true, allowedModelIds: true },
      },
      { prisma },
    );
  }

  /** ตัวเลขสำหรับ dialog ก่อนบันทึก — เทียบกับค่าปัจจุบันของ plan */
  async organizationsImpact(id: string) {
    const plan = await this.planRepo.findOne({
      where: { id },
      select: { isDefault: true, accessCodes: true, allowedModelIds: true },
    });
    if (!plan) throw new NotFoundException(`Plan with ID ${id} not found`);
    const orgs = await this.organizationsUsing(id, plan.isDefault);
    const matching = orgs.filter((org) => matchesPlan(org, plan)).length;
    return { total: orgs.length, matching, customized: orgs.length - matching };
  }
  async findAll() {
    return this.planRepo.findMany({
      orderBy: {
        orderIndex: 'asc',
      },
      include: {
        prices: {
          orderBy: {
            orderIndex: 'asc',
          },
        },
        features: {
          orderBy: {
            orderIndex: 'asc',
          },
          include: {
            feature: true,
          },
        },
      },
    });
  }

  async findByName(name: string) {
    return this.planRepo.findOne({
      where: { name },
      include: {
        prices: true,
        features: {
          orderBy: { orderIndex: 'asc' },
          include: { feature: true },
        },
      },
    });
  }

  async findPopular() {
    return this.planRepo.findMany({
      where: {
        isPopular: true,
      },
      include: {
        prices: {
          orderBy: {
            orderIndex: 'asc',
          },
        },
        features: {
          orderBy: {
            orderIndex: 'asc',
          },
          include: {
            feature: true,
          },
        },
      },
    });
  }

  async findAllFormatted() {
    const plans = await this.findAll();
    return plans.map((plan: any) => { 
      const featuresByCategory =
        plan.features?.reduce((acc: any, pf: any) => {
          const category = pf.category || 'General';
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push({
            icon: pf.feature.icon || '✓',
            text: pf.value,
            isHighlight: pf.isHighlight,
            orderIndex: pf.orderIndex,
          });
          return acc;
        }, {}) || {};

      Object.keys(featuresByCategory).forEach((category) => {
        featuresByCategory[category].sort(
          (a: any, b: any) => a.orderIndex - b.orderIndex,
        );
      });

      const formattedPrices =
        plan.prices?.map((p: any) => ({
          id: p.id,
          interval: p.interval,
          price: Number(p.price),
          duration: p.duration,
          creditAllowance: p.creditAllowance,
          imageAllowance: p.imageAllowance,
          currency: p.currency,
          isDefault: p.isDefault,
          periodCount: p.periodCount,
          periodUnit: p.periodUnit,
        })) || [];

      return {
        ...plan,
        prices: formattedPrices,
        // Backwards compatibility
      
        features:
          plan.features?.map((pf: any) => ({
            icon: pf.feature.icon || '✓',
            text: pf.value,
            isHighlight: pf.isHighlight,
            category: pf.category || 'General',
          })) || [],
        featuresByCategory,
      };
    });
  }

  async findById(id: string) {
    const plan = (await this.planRepo.findOne({
      where: { id },
      include: {
        prices: true,
        features: {
          orderBy: { orderIndex: 'asc' },
          include: { feature: true },
        },
      },
    })) as any;

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }

    const formattedPrices =
      plan?.prices || [];

    const featuresByCategory =
      plan.features?.reduce((acc: any, pf: any) => {
        const category = pf.category || 'General';
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push({
          id: pf.id,
          featureId: pf.featureId,
          key: pf.feature.key,
          label: pf.feature.label,
          icon: pf.feature.icon || '✓',
          text: pf.value,
          isHighlight: pf.isHighlight,
          orderIndex: pf.orderIndex,
        });
        return acc;
      }, {}) || {};

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      badge: plan.badge,
      popular: plan.isPopular,
      isDefault: plan.isDefault,
      borderColor: plan.borderColor,
      status: plan.status,
      accessCodes: plan.accessCodes,
      allowedModelIds: plan.allowedModelIds,
      prices: formattedPrices,
     
      features:
        plan.features?.map((pf: any) => ({
          id: pf.id,
          featureId: pf.featureId,
          key: pf.feature.key,
          label: pf.feature.label,
          icon: pf.feature.icon || '✓',
          text: pf.value,
          isHighlight: pf.isHighlight,
          category: pf.category || 'General',
          orderIndex: pf.orderIndex,
        })) || [],
      featuresByCategory,
      detailJson: plan.detailJson,
    };
  }

  async findPlanWithPrice(priceId: string) {
    const price = await this.planPriceRepo.findOne({
      where: { id: priceId },
      include: { plan: true },
    });
    if (!price) {
      throw new NotFoundException(`Price with ID ${priceId} not found`);
    }
    return price;
  }

  async create(data: any) {
    const { prices, features, popular, detailJson } = data;

    // body แบบเดียวกับ PATCH: prices/features เป็น array ต้องแปลงเป็น nested create;
    // เลือกเฉพาะ column ของ plan เพราะ PlanFormModal ส่งฟิลด์ของฟอร์ม (monthlyPrice ฯลฯ) มาด้วย
    return this.planRepo.create({
      data: {
        ...pick(data, PLAN_CREATE_FIELDS),
        name: data.name,
        detailJson: normalizeDetail(detailJson),
        isPopular: Boolean(popular),
        prices: { create: priceRows(prices) },
        features: { create: featureRows(features) },
      },
    });
  }

  // Touches only `status`: update() recreates every price, which changes the price ids subscriptions point at.
  async updateStatus(id: string, status: boolean) {
    await this.planRepo.update({ where: { id }, data: { status } });
    return this.findById(id);
  }

  async update(id: string, data: any, authUser?: AuthUser) {
    const { prices, features, popular, detailJson, applyToOrganizations, ...rest } = data;
    const scope = parseApplyScope(applyToOrganizations);
    // ไม่ส่ง field ไหนมา = ไม่แตะ field นั้น (ตาราง Model × Plan ส่งแค่ accessCodes / allowedModelIds)
    const detail = detailJson === undefined ? undefined : normalizeDetail(detailJson);

    const { before, appliedOrganizations } = await this.transaction.execute(async (tx) => {
      const before = await this.planRepo.findOne({ where: { id } }, { prisma: tx });
      if (!before) throw new NotFoundException(`Plan with ID ${id} not found`);
      await this.updatePlanRow(id, rest, detail, popular, prices, features, tx);
      const targets = pickTargets(
        await this.organizationsUsing(id, before.isDefault, tx),
        before,
        scope,
      );
      if (targets.length === 0) return { before, appliedOrganizations: 0 };
      const { count } = await this.organizationRepo.updatemany(
        {
          where: { organizationId: { in: targets } },
          data: {
            accessCodes: rest.accessCodes ?? before.accessCodes,
            allowedModelIds: rest.allowedModelIds ?? before.allowedModelIds,
          },
        },
        { prisma: tx },
      );
      return { before, appliedOrganizations: count };
    });

    const changes = changedFields(before, { ...rest, detailJson: detail });
    if (appliedOrganizations > 0) {
      changes.newValues.appliedOrganizations = { scope, count: appliedOrganizations };
    }
    await recordAdminAudit(this.auditLogRepo, {
      userId: authUser?.userId,
      entityName: 'plan',
      entityId: id,
      ...changes,
    });
    return { ...(await this.findById(id)), appliedOrganizations };
  }

  private updatePlanRow(
    id: string,
    rest: Record<string, unknown>,
    detail: ReturnType<typeof normalizeDetail> | undefined,
    popular: unknown,
    prices: any[] | undefined,
    features: any[] | undefined,
    tx: TQueryClient,
  ) {
    return this.planRepo.update({
      where: { id },
      data: {
        ...rest,
        detailJson: detail,
        isPopular: popular,
        prices: prices === undefined ? undefined : { deleteMany: {}, create: priceRows(prices) },
        features: features === undefined ? undefined : { deleteMany: {}, create: featureRows(features) },
      },
    }, { prisma: tx });
  }

  async delete(id: string) {
    // Delete relations first if not handled by cascade (check schema)
    // schema.prisma doesn't show onDelete: Cascade, so manually delete
    // Actually, prisma can handle it if we use delete with the planRepo
    // But we need to make sure prices and features are deleted.

    // In many cases we want to soft delete or just delete.
    return this.planRepo.delete({
      where: { id },
    });
  }
}

/** detailJson มาจากฟอร์ม plan-management เป็นค่าอิสระ — แปลงทีละ field แบบเดิม */
function normalizeDetail(detailJson: any) {
  return {
    maxUserAccess: +detailJson?.maxUserAccess || 0,
    creditAllowance: +detailJson?.creditAllowance || 0,
    imageAllowance: +detailJson?.imageAllowance || 0,
    duration: +detailJson?.duration || 0,
    unit: detailJson?.unit || '',
  };
}

const PLAN_CREATE_FIELDS = [
  'description',
  'badge',
  'borderColor',
  'isDefault',
  'status',
  'orderIndex',
  'accessCodes',
  'allowedModelIds',
] as const;

function pick(data: Record<string, unknown>, keys: readonly string[]) {
  return Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}

function priceRows(prices: any[] | undefined) {
  return (
    prices?.map((p: any, index: number) => ({
      interval: p.interval,
      price: p.price,
      periodCount: p.periodCount || 0,
      creditAllowance: p.creditAllowance || 0,
      imageAllowance: p.imageAllowance || 0,
      currency: p.currency || 'THB',
      isDefault: p.isDefault || false,
      periodUnit: p.periodUnit,
      orderIndex: p.orderIndex ?? index,
    })) || []
  );
}

function featureRows(features: any[] | undefined) {
  return (
    features?.map((f: any) => ({
      value: f.text,
      isHighlight: f.isHighlight,
      orderIndex: f.orderIndex || 0,
      category: f.category || 'General',
      feature: {
        connectOrCreate: {
          where: { key: f.key },
          create: { key: f.key, label: f.label || f.key, icon: f.icon },
        },
      },
    })) || []
  );
}
