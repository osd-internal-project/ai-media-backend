import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  PhotoEventPhotoRepository,
  TosService,
  buildUploadKey,
} from '@ai-media/share';
import { v4 as uuidv4 } from 'uuid';
import { tosConfigs } from '../configs';
import { WebsocketGatewayService } from '../websocket/websocket.gateway';
import { PhotoEventPhotoView } from './dto/photo-event-view.dto';
import { UploadPhotosDto } from './dto/upload-photos.dto';
import { PhotoEventAccessService } from './photo-event-access.service';
import { preparePhoto } from './photo-event-image';
import {
  PHOTO_EVENT_EVENTS,
  PHOTO_EVENT_ROOM_TYPE,
} from './photo-event.constants';
import { PhotoEventViewService } from './photo-event-view.service';

@Injectable()
export class PhotoEventPhotosService {
  private readonly logger = new Logger(PhotoEventPhotosService.name);

  constructor(
    private readonly photoRepo: PhotoEventPhotoRepository,
    private readonly tosService: TosService,
    private readonly gateway: WebsocketGatewayService,
    private readonly access: PhotoEventAccessService,
    private readonly view: PhotoEventViewService,
  ) {}

  async findByProject(projectId: string): Promise<PhotoEventPhotoView[]> {
    const photos = await this.photoRepo.findManyWithGenerations({
      where: { projectId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return this.view.toPhotoViews(photos);
  }

  async upload(
    projectId: string,
    dto: UploadPhotosDto,
    files: Express.Multer.File[],
  ): Promise<PhotoEventPhotoView[]> {
    const project = await this.access.findActiveProject(projectId);
    await this.access.ensurePermission(projectId, dto.userId);

    const imageFiles = (files ?? []).filter((file) =>
      file.mimetype.startsWith('image/'),
    );
    const created: PhotoEventPhotoView[] = [];
    // ทีละไฟล์ เพื่อให้รูปขึ้นบนจอ kiosk ตามลำดับที่อัปโหลด
    for (const file of imageFiles) {
      const prepared = await preparePhoto(file);
      // sharp อ่านไม่ได้ = ไม่ใช่รูปจริง (mimetype มาจาก client) — ไม่เก็บไฟล์ต้นฉบับ
      if (!prepared.converted) {
        this.logger.warn(
          `Cannot resize ${file.originalname} (${file.mimetype}) — skipped`,
        );
        continue;
      }
      const imagePath = buildUploadKey(
        project.organizationId,
        projectId,
        uuidv4(),
        prepared.extension,
      );
      await this.tosService.putObject(
        tosConfigs().tosBucket,
        imagePath,
        prepared.buffer,
      );
      const photo = await this.photoRepo.create({
        data: {
          projectId,
          organizationId: project.organizationId,
          userId: dto.userId,
          imagePath,
          imageName: file.originalname,
          imageType: prepared.mimetype,
          imageSize: prepared.buffer.length,
        },
      });
      const photoView = {
        ...(await this.view.toPhotoBase(photo)),
        generations: [],
      };
      this.emit(projectId, PHOTO_EVENT_EVENTS.photoCreated, photoView);
      created.push(photoView);
    }
    if (imageFiles.length > 0 && created.length === 0) {
      // ทุกไฟล์ถูกข้าม — แจ้งผู้ใช้แทนการคืนผลว่างเงียบ ๆ
      throw new BadRequestException(
        'No readable images — use JPEG, PNG, WebP or GIF',
      );
    }
    this.logger.log(`Imported ${created.length} photos into ${projectId}`);
    return created;
  }

  /** soft delete — generation ที่อ้างถึงรูปนี้ยังเปิดจาก QR ได้ */
  async remove(projectId: string, photoId: string, userId: string) {
    await this.access.ensurePermission(projectId, userId);
    const photo = await this.photoRepo.findOne({
      where: { id: photoId, projectId, status: 'active' },
    });
    if (!photo) throw new NotFoundException(`Photo ${photoId} not found`);

    await this.photoRepo.update({
      where: { id: photoId },
      data: { status: 'deleted' },
    });
    this.emit(projectId, PHOTO_EVENT_EVENTS.photoDeleted, { photoId });
    return { success: true };
  }

  private emit(projectId: string, event: string, data: unknown): void {
    this.gateway.emitToRoom(
      `${projectId}:${PHOTO_EVENT_ROOM_TYPE}`,
      event,
      data,
    );
  }
}
