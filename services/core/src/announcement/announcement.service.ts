import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AnnouncementRepository,
  AuthUser,
  StorageUrlService,
  TosService,
} from '@ai-media/share';
import { Announcement } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { tosConfigs } from '../configs';
import { AnnouncementView } from './dto/announcement-view.dto';
import {
  AnnouncementCategory,
  SaveAnnouncementDto,
} from './dto/save-announcement.dto';
import { prepareAnnouncementImage } from './announcement-image';

const SYSTEM_ADMIN_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];
const ORDER_BY = [
  { sortOrder: 'asc' as const },
  { createdAt: 'desc' as const },
];

/** ประกาศบนหน้า public — super admin จัดการ, active ได้หลายชิ้นพร้อมกัน */
@Injectable()
export class AnnouncementService {
  private readonly logger = new Logger(AnnouncementService.name);

  constructor(
    private readonly announcementRepo: AnnouncementRepository,
    private readonly tosService: TosService,
    private readonly storageUrl: StorageUrlService,
  ) {}

  async findAll(authUser: AuthUser | undefined): Promise<AnnouncementView[]> {
    this.assertSuperAdmin(authUser);
    const rows = await this.announcementRepo.findMany({ orderBy: ORDER_BY });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  async findActive(): Promise<AnnouncementView[]> {
    const rows = await this.announcementRepo.findMany({
      where: { isActive: true },
      orderBy: ORDER_BY,
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  async create(
    authUser: AuthUser | undefined,
    dto: SaveAnnouncementDto,
    file: Express.Multer.File | undefined,
  ): Promise<AnnouncementView> {
    this.assertSuperAdmin(authUser);
    const imageKey = file ? await this.uploadImage(file) : null;
    const row = await this.announcementRepo.create({
      data: {
        category: dto.category,
        title: dto.title.trim(),
        body: dto.body?.trim() || null,
        imageKey,
        isActive: dto.isActive ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    return this.toView(row);
  }

  async update(
    authUser: AuthUser | undefined,
    id: string,
    dto: SaveAnnouncementDto,
    file: Express.Multer.File | undefined,
  ): Promise<AnnouncementView> {
    this.assertSuperAdmin(authUser);
    const existing = await this.findOwned(id);
    const replaceImage = Boolean(file) || dto.removeImage === true;
    const imageKey = file
      ? await this.uploadImage(file)
      : dto.removeImage
      ? null
      : existing.imageKey;
    const row = await this.announcementRepo.update({
      where: { id },
      data: {
        category: dto.category,
        title: dto.title.trim(),
        body: dto.body?.trim() || null,
        imageKey,
        isActive: dto.isActive ?? existing.isActive,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
      },
    });
    if (replaceImage) await this.deleteImage(existing.imageKey);
    return this.toView(row);
  }

  async setActive(
    authUser: AuthUser | undefined,
    id: string,
    isActive: boolean,
  ): Promise<AnnouncementView> {
    this.assertSuperAdmin(authUser);
    await this.findOwned(id);
    const row = await this.announcementRepo.update({
      where: { id },
      data: { isActive },
    });
    return this.toView(row);
  }

  async remove(authUser: AuthUser | undefined, id: string): Promise<void> {
    this.assertSuperAdmin(authUser);
    const existing = await this.findOwned(id);
    await this.announcementRepo.delete({ where: { id } });
    await this.deleteImage(existing.imageKey);
  }

  private assertSuperAdmin(authUser: AuthUser | undefined) {
    // trim ก่อนเทียบ — ข้อมูล role ในระบบมีค่าที่ติดช่องว่างท้ายอยู่จริง
    const role = authUser?.role?.trim();
    if (!role || !SYSTEM_ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Only a system administrator can manage announcements',
      );
    }
  }

  private async findOwned(id: string): Promise<Announcement> {
    const row = await this.announcementRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Announcement ${id} not found`);
    return row;
  }

  private async uploadImage(file: Express.Multer.File): Promise<string> {
    const buffer = await prepareAnnouncementImage(file);
    const key = `announcements/${uuidv4()}.jpg`;
    await this.tosService.putObject(tosConfigs().tosBucket, key, buffer);
    this.logger.log(
      `Uploaded announcement image ${key} (${buffer.length} bytes)`,
    );
    return key;
  }

  /** row ถูกลบ/แก้ไปแล้ว — ไฟล์ค้างใน TOS ไม่ทำให้ข้อมูลเสีย จึง log แทน throw */
  private async deleteImage(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await this.tosService.deleteObject(tosConfigs().tosBucket, key);
    } catch (error) {
      this.logger.warn(
        `Failed to delete announcement image ${key}: ${
          (error as Error).message
        }`,
      );
    }
  }

  private async toView(row: Announcement): Promise<AnnouncementView> {
    return {
      id: row.id,
      // ค่าใน DB ผ่าน IsIn ของ SaveAnnouncementDto มาแล้วเสมอ
      category: row.category as AnnouncementCategory,
      title: row.title,
      body: row.body,
      imageUrl: await this.storageUrl.toDisplayUrl(row.imageKey, null),
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
