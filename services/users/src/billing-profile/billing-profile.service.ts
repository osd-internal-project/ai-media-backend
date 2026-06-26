import { Injectable, NotFoundException } from '@nestjs/common';
import { BillingProfileRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { CreateBillingProfileDto } from './dto/create-billing-profile.dto';
import { UpdateBillingProfileDto } from './dto/update-billing-profile.dto';

@Injectable()
export class BillingProfileService {
  constructor(
    private readonly billingProfileRepo: BillingProfileRepository,
  ) {}

  /**
   * Create a billing profile. When flagged default, clears the default flag on
   * the user's other profiles first so only one stays default.
   */
  async create(dto: CreateBillingProfileDto) {
    if (dto.isDefault) {
      await this.billingProfileRepo.updateMany({
        where: { userId: dto.userId },
        data: { isDefault: false },
      });
    }
    const data: Prisma.BillingProfileCreateInput = {
      userId: dto.userId,
      organizationId: dto.organizationId,
      type: dto.type,
      address: dto.address,
      isDefault: dto.isDefault ?? false,
      fullName: dto.fullName ?? null,
      nationalId: dto.nationalId ?? null,
      companyName: dto.companyName ?? null,
      taxId: dto.taxId ?? null,
      branchCode: dto.branchCode ?? null,
      branchName: dto.branchName ?? null,
      contactName: dto.contactName ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
    };
    return this.billingProfileRepo.create({ data });
  }

  /** List a user's billing profiles (default first, newest next). */
  findByUserId(userId: string) {
    return this.billingProfileRepo.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** List an organization's billing profiles. */
  findByOrganizationId(organizationId: string) {
    return this.billingProfileRepo.findMany({
      where: { organizationId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const profile = await this.billingProfileRepo.findUnique({ where: { id } });
    if (!profile) {
      throw new NotFoundException(`Billing profile ${id} not found`);
    }
    return profile;
  }

  async update(id: string, dto: UpdateBillingProfileDto) {
    const profile = await this.findOne(id);
    if (dto.isDefault) {
      await this.billingProfileRepo.updateMany({
        where: { userId: profile.userId },
        data: { isDefault: false },
      });
    }
    return this.billingProfileRepo.update({
      where: { id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.fullName !== undefined && { fullName: dto.fullName }),
        ...(dto.nationalId !== undefined && { nationalId: dto.nationalId }),
        ...(dto.companyName !== undefined && { companyName: dto.companyName }),
        ...(dto.taxId !== undefined && { taxId: dto.taxId }),
        ...(dto.branchCode !== undefined && { branchCode: dto.branchCode }),
        ...(dto.branchName !== undefined && { branchName: dto.branchName }),
        ...(dto.contactName !== undefined && { contactName: dto.contactName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
      },
    });
  }

  /** Mark one profile as the user's default, unsetting the rest. */
  async setDefault(id: string) {
    const profile = await this.findOne(id);
    await this.billingProfileRepo.updateMany({
      where: { userId: profile.userId },
      data: { isDefault: false },
    });
    return this.billingProfileRepo.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.billingProfileRepo.delete({ where: { id } });
  }
}
