import { Injectable } from '@nestjs/common';
import { PlanRepository } from '@ai-media/share';

@Injectable()
export class PlanService {
  constructor(private readonly planRepo: PlanRepository) {}
  async findAll() {
    return this.planRepo.findMany({
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        prices: {
          orderBy: {
            period: 'asc',
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
            period: 'asc',
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
      const monthlyPrice = plan.prices?.find((p: any) => p.period === 'monthly')?.price;
      const annuallyPrice = plan.prices?.find((p: any) => p.period === 'annually')?.price;
      
      const featuresByCategory = plan.features?.reduce((acc: any, pf: any) => {
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

      Object.keys(featuresByCategory).forEach(category => {
        featuresByCategory[category].sort((a: any, b: any) => a.orderIndex - b.orderIndex);
      });
      
      return {
        name: plan.name,
        description: plan.description,
        badge: plan.badge,
        popular: plan.isPopular,
        borderColor: plan.borderColor,
        price: {
          monthly: monthlyPrice ? Number(monthlyPrice) : 0,
          annually: annuallyPrice ? Number(annuallyPrice) : 0,
        },
        features: plan.features?.map((pf: any) => ({
          icon: pf.feature.icon || '✓',
          text: pf.value,
          isHighlight: pf.isHighlight,
          category: pf.category || 'General',
        })) || [],
        featuresByCategory,
      };
    });
  }
}
