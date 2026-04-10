import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanRepository, PlanPriceRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class PlanService {
  constructor(
    private readonly planRepo: PlanRepository,
    private readonly planPriceRepo: PlanPriceRepository,
  ) {}
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
    const { prices, features, popular, detailJson, ...rest } = data;

    return this.planRepo.create({
      data: data,
    });
  }

  async update(id: string, data: any) {
    const { prices, features, popular, detailJson, ...rest } = data;

    await this.planRepo.update({
      where: { id },
      data: {
        ...rest,
        detailJson: {
          maxUserAccess: +detailJson?.maxUserAccess || 0,
          creditAllowance: +detailJson?.creditAllowance || 0,
          imageAllowance: +detailJson?.imageAllowance || 0,
          duration: +detailJson?.duration || 0,
          unit: detailJson?.unit || '',
        },
        isPopular: popular,
        prices: {
          deleteMany: {},
          create:
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
            })) || [],
        },
        features: {
          deleteMany: {},
          create:
            features?.map((f: any) => ({
              value: f.text,
              isHighlight: f.isHighlight,
              orderIndex: f.orderIndex || 0,
              category: f.category || 'General',
              feature: {
                connectOrCreate: {
                  where: { key: f.key },
                  create: {
                    key: f.key,
                    label: f.label || f.key,
                    icon: f.icon,
                  },
                },
              },
            })) || [],
        },
      },
    });

    return this.findById(id);
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
