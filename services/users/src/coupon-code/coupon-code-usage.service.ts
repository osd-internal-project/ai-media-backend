import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CouponCodeUsageRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class CouponCodeUsageService {
  private readonly logger = new Logger(CouponCodeUsageService.name);

  constructor(
    private readonly couponCodeUsageRepo: CouponCodeUsageRepository,
  ) {}

  async findAll(condition: Prisma.CouponCodeUsageFindManyArgs) {
    return this.couponCodeUsageRepo.findAll(condition);
  }

  async findOne(id: string) {
    const usage = await this.couponCodeUsageRepo.findOne({ where: { id } });
    if (!usage) {
      throw new NotFoundException(`Coupon code usage with ID ${id} not found`);
    }
    return usage;
  }

  async findUsageByCouponCodeId(couponCodeId: string) {
    const usage = await this.couponCodeUsageRepo.findMany({
      where: { couponCodeId },
    });
    if (!usage) {
      throw new NotFoundException(
        `Coupon code usage with ID ${couponCodeId} not found`,
      );
    }
    return usage;
  }

  async create(data: Prisma.CouponCodeUsageCreateInput) {
    return this.couponCodeUsageRepo.create({ data });
  }
}
