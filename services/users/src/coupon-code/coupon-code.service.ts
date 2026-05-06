import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CouponCodeRepository,
  CouponCodeUsageRepository,
  CreditBalanceRepository,
  OrganizationRepository,
  UsersRepository,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { UseCouponCodeDto } from './dto/use-coupon.dto';
import * as Papa from 'papaparse';
import * as dayjs from 'dayjs';

@Injectable()
export class CouponCodeService {
  constructor(
    private readonly couponCodeRepo: CouponCodeRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly creditBalanceRepository: CreditBalanceRepository,
    private readonly userRepository: UsersRepository,
    private readonly couponCodeUsageRepo: CouponCodeUsageRepository,
  ) {}

  async create(data: Prisma.CouponCodeCreateInput) {
    return this.couponCodeRepo.create({ data });
  }
  async createGroup(data: Prisma.CouponCodeCreateInput & { amount: number }) {
    const { amount, ...rest } = data;

    let success = 0;
    for (let i = 0; i < amount; i++) {
      const data = await this.couponCodeRepo.create({ data: { ...rest } });
      if (data) success++;
    }
    return { success, amount, fail: amount - success };
  }

  async useCoupon(data: UseCouponCodeDto) {
    const { userId, organizationId, code } = data;
    const cuponCode = await this.couponCodeRepo.findOne({
      where: { code, status: 'ACTIVE' },
    });
    if (!cuponCode) {
      throw new NotFoundException(`Coupon is not found`);
    }

    if (cuponCode.expiresAt < new Date()) {
      throw new NotFoundException(`Coupon is expired`);
    }
    Logger.debug(cuponCode);
    if (
      cuponCode?.fixOrganizationId &&
      cuponCode.fixOrganizationId !== organizationId
    ) {
      throw new NotFoundException(`Use Coupon failed`);
    }
    const organization = await this.organizationRepository.findOne({
      where: { organizationId: organizationId },
    });
    if (!organization) {
      throw new NotFoundException(`Use Coupon failed`);
    }
    const user = await this.userRepository.findOne({
      where: { userId: userId },
    });
    const usage = await this.couponCodeUsageRepo.count({
      where: { couponCodeId: cuponCode.id },
    });
    if (usage >= cuponCode.usageLimit) {
      throw new NotFoundException(`Coupon is limited`);
    }

    await this.organizationRepository.update({
      where: { organizationId: organizationId },
      data: {
        creditBalance: {
          upsert: {
            create: { onTopBalance: cuponCode.onTopCredit },
            update: { onTopBalance: { increment: cuponCode.onTopCredit } },
          },
        },
      },
    });

    const credit = await this.creditBalanceRepository.findOne({
      where: { organizationId: organizationId },
    });
    const form = {
      usedAt: new Date(),
      usedById: user.userId,
      usedByName: user.fullname,
      onTopCredit: cuponCode.onTopCredit,
      organizationName: organization.name,
      organizationCode: organization.organizationId,
      couponCode: { connect: { id: cuponCode.id } },
      remainCredit: credit.onTopBalance,
    } as Prisma.CouponCodeUsageCreateInput;
    const result = await this.couponCodeUsageRepo.create({ data: form });
    if (usage + 1 === cuponCode.usageLimit) {
      await this.couponCodeRepo.update({
        where: { id: cuponCode.id },
        data: { status: 'INACTIVE' },
      });
    }
    return {
      status: 'success',
      data: result,
      message: 'Coupon used successfully',
    };
  }

  async findMany(condition: any) {
    const { skip, take, status, code, referenceTag } = condition;
    const prismaWhere: Prisma.CouponCodeWhereInput = {
      ...(code && { code: { contains: code, mode: 'insensitive' } }),
      ...(status && { status }),
      ...(referenceTag && {
        referenceTag: { contains: referenceTag, mode: 'insensitive' },
      }),
    };
    const [data, total] = await Promise.all([
      this.couponCodeRepo.findMany({
        where: prismaWhere,
        skip: skip ? +skip : undefined,
        take: take ? +take : undefined,
        orderBy: { createdAt: 'desc' },
      }),
      this.couponCodeRepo.count({
        where: prismaWhere,
      }),
    ]);
    return { data, total };
  }

  async findUsageManyByOrganization(organizationCode: string, condition: any) {
    const { skip, take } = condition;
    const prismaWhere: Prisma.CouponCodeUsageWhereInput = {
      organizationCode,
    };
    const [data, total] = await Promise.all([
      this.couponCodeUsageRepo.findMany({
        where: prismaWhere,
        skip: skip ? +skip : undefined,
        take: take ? +take : undefined,
        orderBy: { createdAt: 'desc' },
        include: { couponCode: true },
      }),
      this.couponCodeUsageRepo.count({
        where: prismaWhere,
      }),
    ]);
    return { data, total };
  }

  async findOne(id: string) {
    const coupon = await this.couponCodeRepo.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException(`Coupon with ID ${id} not found`);
    }
    return coupon;
  }

  async findByCode(code: string) {
    const coupon = await this.couponCodeRepo.findOne({ where: { code } });
    if (!coupon) {
      throw new NotFoundException(`Coupon with code ${code} not found`);
    }
    return coupon;
  }

  async update(id: string, data: Prisma.CouponCodeUpdateInput) {
    return this.couponCodeRepo.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.couponCodeRepo.delete({ where: { id } });
  }

  async exportCsv(condition: any) {
    // console.log(condition);
    const { data } = await this.findMany({ ...condition });
    // console.log(data.length);
    const exportData = data.map((item, index) => ({
      No: index + 1,
      Code: item.code,
      Credit: item.onTopCredit,
      Limit: item.usageLimit,
      Tag: item.referenceTag || '',
      'Expired At': dayjs(item.expiresAt).format('YYYY-MM-DD HH:mm:ss'),
      Status: item.status,
    }));

    const csv = Papa.unparse(exportData);
    return '\uFEFF' + csv; // BOM for UTF-8 Excel support
  }
}
