import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, BrandKitDetailRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';
import {
  BrandKitAccess,
  BrandKitService,
  DETAIL_ORDER,
} from '../brand-kit/brand-kit.service';
import {
  CreateBrandKitDetailDto,
  UpdateBrandKitDetailDto,
} from './dto/brand-kit-detail.dto';

// #RGB is accepted too: rows saved before validation existed use it and must stay editable
const HEX_COLOR = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function assertValidDetail(type: string, detail?: Record<string, unknown>) {
  if (type === 'colors' && !HEX_COLOR.test(String(detail?.hex ?? ''))) {
    throw new BadRequestException('Color hex must look like #1A2B3C or #1AB');
  }
}

@Injectable()
export class BrandKitDetailService {
  constructor(
    private readonly brandKitDetailRepo: BrandKitDetailRepository,
    private readonly brandKitService: BrandKitService,
  ) {}

  /** Loads a detail and checks the caller against its kit's organization. */
  private async getDetailFor(
    authUser: AuthUser | undefined,
    id: string,
    level: BrandKitAccess,
  ) {
    const detail = await this.brandKitDetailRepo.findOne({ where: { id } });
    // a detail whose kit was removed (FK SET NULL) belongs to nobody
    if (!detail?.brandKitId) {
      await this.brandKitService.memberOrganizationIds(authUser);
      throw new NotFoundException('Brand kit detail not found');
    }
    await this.brandKitService.getKitFor(authUser, detail.brandKitId, level);
    return detail;
  }

  async create(authUser: AuthUser | undefined, data: CreateBrandKitDetailDto) {
    await this.brandKitService.getKitFor(authUser, data.brandKitId, 'edit');
    assertValidDetail(data.type, data.detail);
    return this.brandKitDetailRepo.create({
      data: { ...data, detail: data.detail as Prisma.InputJsonValue },
    });
  }

  async findAll(authUser: AuthUser | undefined) {
    const organizationIds =
      await this.brandKitService.memberOrganizationIds(authUser);
    return this.brandKitDetailRepo.findMany({
      where: { brandKit: { organizationId: { in: organizationIds } } },
    });
  }

  async findOne(authUser: AuthUser | undefined, id: string) {
    return this.getDetailFor(authUser, id, 'read');
  }

  async findByBrandKitAndType(
    authUser: AuthUser | undefined,
    type: string,
    brandKitId: string,
  ) {
    await this.brandKitService.getKitFor(authUser, brandKitId, 'read');
    return this.brandKitDetailRepo.findMany({
      where: { brandKitId, type },
      orderBy: DETAIL_ORDER,
    });
  }

  async findByBrandKit(authUser: AuthUser | undefined, brandKitId: string) {
    await this.brandKitService.getKitFor(authUser, brandKitId, 'read');
    return this.brandKitDetailRepo.findMany({
      where: { brandKitId },
      orderBy: DETAIL_ORDER,
    });
  }

  async update(
    authUser: AuthUser | undefined,
    id: string,
    data: UpdateBrandKitDetailDto,
  ) {
    const existing = await this.getDetailFor(authUser, id, 'edit');
    if (data.detail) assertValidDetail(data.type ?? existing.type, data.detail);
    return this.brandKitDetailRepo.update({
      where: { id },
      data: { ...data, detail: data.detail as Prisma.InputJsonValue },
    });
  }

  async remove(authUser: AuthUser | undefined, id: string) {
    await this.getDetailFor(authUser, id, 'edit');
    return this.brandKitDetailRepo.delete({
      where: { id },
    });
  }
}
