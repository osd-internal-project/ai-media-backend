import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PhotoEventPrintTemplateRepository,
  PrismaTransactionService,
  StorageUrlService,
  TosService,
  buildUploadKey,
} from '@ai-media/share';
import { PhotoEventPrintTemplate, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { tosConfigs } from '../configs';
import {
  PhotoEventPrintAssetView,
  PhotoEventPrintTemplateView,
} from './dto/photo-event-view.dto';
import { SavePrintTemplateDto } from './dto/save-print-template.dto';
import { PhotoEventAccessService } from './photo-event-access.service';
import { preparePrintAsset } from './photo-event-image';
import {
  PrintLayout,
  collectAssetKeys,
  parsePrintLayout,
} from './photo-event-print-layout';

/** template การพิมพ์การ์ดของ Photo Event — project มีได้หลายแบบ active ทีละ 1 */
@Injectable()
export class PhotoEventPrintService {
  private readonly logger = new Logger(PhotoEventPrintService.name);

  constructor(
    private readonly printTemplateRepo: PhotoEventPrintTemplateRepository,
    private readonly tosService: TosService,
    private readonly storageUrl: StorageUrlService,
    private readonly transaction: PrismaTransactionService,
    private readonly access: PhotoEventAccessService,
  ) {}

  async findByProject(
    projectId: string,
  ): Promise<PhotoEventPrintTemplateView[]> {
    const rows = await this.printTemplateRepo.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(rows.map((row) => this.toView(row)));
  }

  /** null = ยังไม่มี template ที่ active — frontend ใช้ layout default */
  async findActive(
    projectId: string,
  ): Promise<PhotoEventPrintTemplateView | null> {
    const row = await this.printTemplateRepo.findOne({
      where: { projectId, isActive: true },
    });
    return row ? this.toView(row) : null;
  }

  async create(
    projectId: string,
    dto: SavePrintTemplateDto,
  ): Promise<PhotoEventPrintTemplateView> {
    const layout = await this.authorizeAndParse(projectId, dto);
    // template แรกของ project ใช้พิมพ์ทันที ไม่ต้องกด activate เอง
    const hasAny = await this.printTemplateRepo.findOne({
      where: { projectId },
    });
    const row = await this.printTemplateRepo.create({
      data: {
        projectId,
        name: dto.name.trim(),
        isActive: !hasAny,
        layout: this.toJson(layout),
      },
    });
    this.logger.log(`Created print template ${row.id} in ${projectId}`);
    return this.toView(row);
  }

  async update(
    projectId: string,
    templateId: string,
    dto: SavePrintTemplateDto,
  ): Promise<PhotoEventPrintTemplateView> {
    const layout = await this.authorizeAndParse(projectId, dto);
    await this.findOwned(projectId, templateId);
    const row = await this.printTemplateRepo.update({
      where: { id: templateId },
      data: { name: dto.name.trim(), layout: this.toJson(layout) },
    });
    return this.toView(row);
  }

  async activate(
    projectId: string,
    templateId: string,
    userId: string,
  ): Promise<PhotoEventPrintTemplateView> {
    await this.access.ensurePermission(projectId, userId, 'ADMIN');
    await this.findOwned(projectId, templateId);
    const row = await this.transaction.execute(async (prisma) => {
      await this.printTemplateRepo.updateMany(
        { where: { projectId, isActive: true }, data: { isActive: false } },
        { prisma },
      );
      return this.printTemplateRepo.update(
        { where: { id: templateId }, data: { isActive: true } },
        { prisma },
      );
    });
    this.logger.log(`Activated print template ${templateId} in ${projectId}`);
    return this.toView(row);
  }

  /** ลบตัวที่ active แล้ว kiosk จะกลับไปพิมพ์ด้วย layout default */
  async remove(projectId: string, templateId: string, userId: string) {
    await this.access.ensurePermission(projectId, userId, 'ADMIN');
    await this.findOwned(projectId, templateId);
    await this.printTemplateRepo.delete({ where: { id: templateId } });
    this.logger.log(`Deleted print template ${templateId} in ${projectId}`);
    return { success: true };
  }

  async uploadAsset(
    projectId: string,
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<PhotoEventPrintAssetView> {
    const project = await this.access.findActiveProject(projectId);
    await this.access.ensurePermission(projectId, userId, 'ADMIN');
    if (!file) throw new BadRequestException('No file uploaded');

    const prepared = await preparePrintAsset(file);
    const key = buildUploadKey(
      project.organizationId,
      projectId,
      uuidv4(),
      prepared.extension,
    );
    await this.tosService.putObject(
      tosConfigs().tosBucket,
      key,
      prepared.buffer,
    );
    this.logger.log(
      `Uploaded print asset ${key} (${prepared.buffer.length} bytes)`,
    );
    return { key, url: await this.storageUrl.toDisplayUrl(key) };
  }

  private async authorizeAndParse(
    projectId: string,
    dto: SavePrintTemplateDto,
  ): Promise<PrintLayout> {
    const project = await this.access.findActiveProject(projectId);
    await this.access.ensurePermission(projectId, dto.userId, 'ADMIN');
    if (!dto.name.trim())
      throw new BadRequestException('Template name is required');
    // prefix เดียวกับ uploadAsset — กัน layout อ้าง key ของ project อื่น
    const assetPrefix = buildUploadKey(project.organizationId, projectId, '');
    return parsePrintLayout(dto.layout, assetPrefix);
  }

  private async findOwned(projectId: string, templateId: string) {
    const row = await this.printTemplateRepo.findOne({
      where: { id: templateId, projectId },
    });
    if (!row)
      throw new NotFoundException(`Print template ${templateId} not found`);
    return row;
  }

  private toJson(layout: PrintLayout): Prisma.InputJsonValue {
    // PrintLayout เป็น plain JSON (ผ่าน parsePrintLayout แล้ว) แต่ interface ไม่มี index signature ที่ Prisma ต้องการ
    return layout as unknown as Prisma.InputJsonValue;
  }

  private async toView(
    row: PhotoEventPrintTemplate,
  ): Promise<PhotoEventPrintTemplateView> {
    // เขียนผ่าน parsePrintLayout เท่านั้น จึงเชื่อรูปร่างของ JSON ที่อ่านกลับมาได้
    const layout = row.layout as unknown as PrintLayout;
    const entries = await Promise.all(
      collectAssetKeys(layout).map(
        async (key) => [key, await this.storageUrl.toDisplayUrl(key)] as const,
      ),
    );
    return {
      id: row.id,
      name: row.name,
      isActive: row.isActive,
      layout,
      assetUrls: Object.fromEntries(
        entries.filter((entry): entry is readonly [string, string] =>
          Boolean(entry[1]),
        ),
      ),
      updatedAt: row.updatedAt,
    };
  }
}
