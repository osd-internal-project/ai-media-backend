import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthUser,
  BrandKitDetailRepository,
  parseBrandKitKey,
} from '@ai-media/share';
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

const IMAGE_TYPES = ['logo', 'style_ref'];

/**
 * @param kit the kit the detail belongs to; an image key must sit in that kit's own folder,
 *   so a detail can never point at another organization's file
 */
function assertValidDetail(
  type: string,
  detail: Record<string, unknown> | undefined,
  kit: { id: string; organizationId: string },
) {
  if (type === 'colors' && !HEX_COLOR.test(String(detail?.hex ?? ''))) {
    throw new BadRequestException('Color hex must look like #1A2B3C or #1AB');
  }
  if (IMAGE_TYPES.includes(type) && detail?.key !== undefined) {
    const parsed =
      typeof detail.key === 'string' ? parseBrandKitKey(detail.key) : null;
    if (
      !parsed ||
      parsed.organizationId !== kit.organizationId ||
      parsed.brandKitId !== kit.id
    ) {
      throw new BadRequestException('Image does not belong to this brand kit');
    }
  }
  if (type === 'style_ref' && detail?.key === undefined) {
    throw new BadRequestException('A style image needs an uploaded file');
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
    const kit = await this.brandKitService.getKitFor(
      authUser,
      detail.brandKitId,
      level,
    );
    return { ...detail, kit };
  }

  async create(authUser: AuthUser | undefined, data: CreateBrandKitDetailDto) {
    const kit = await this.brandKitService.getKitFor(
      authUser,
      data.brandKitId,
      'edit',
    );
    assertValidDetail(data.type, data.detail, kit);
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
    const { kit: _kit, ...detail } = await this.getDetailFor(
      authUser,
      id,
      'read',
    );
    return detail;
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
    if (data.detail) {
      assertValidDetail(data.type ?? existing.type, data.detail, existing.kit);
    }
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
