import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { appConfigs, tosConfigs } from '../configs';
import {
  AuthUser,
  GalleryRepository,
  PromptGuideImageRepository,
  RefImageRepository,
  StorageUrlService,
  TosService,
  buildOutputKey,
  buildPromptGuideKey,
  buildUploadKey,
} from '@ai-media/share';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MAX_BYTES_BY_MEDIA,
  UploadGenerateType,
  isAllowedUpload,
  isExtensionAllowed,
  mediaTypeOfMime,
} from './upload-rules';
import { UploadAccessService } from './upload-access.service';

const PRESIGN_PUT_EXPIRES_SEC = 15 * 60;
/** row ที่ออก presigned URL แล้วแต่ยังไม่ confirm — cron ลบทิ้งเมื่อค้างเกิน 24 ชม. */
const STATUS_UPLOADING = 'uploading';
/** Gallery row ของไฟล์จาก video editor ที่ยังไม่ confirm — status=false จึงยังไม่โผล่ใน Library */
const GALLERY_UPLOADING = 'UPLOADING';
const EDITOR_FEATURE_TYPE = 'editor';
const EDITOR_EXPORT_MIME = 'video/mp4';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `editor-export` = MP4 ที่ export จาก video editor ใน browser แล้วบันทึกเข้า Library */
export type DirectUploadKind = 'ref' | 'prompt-guide' | 'editor-export';

/** object key เก็บใน generateConfig เพราะ Gallery ไม่มี organizationId ให้ประกอบ key ใหม่ */
function editorObjectKey(generateConfig: unknown): string | null {
  if (typeof generateConfig !== 'object' || generateConfig === null) return null;
  const key = (generateConfig as { objectKey?: unknown }).objectKey;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

export interface PresignUploadInput {
  kind: DirectUploadKind;
  userId: string;
  index: number;
  uid: string;
  organizationId: string;
  generateType: UploadGenerateType;
  fileName: string;
  contentType: string;
  size: number;
  /** kind = 'ref' */
  projectId?: string;
  /** kind = 'prompt-guide' */
  promptGuideId?: string;
}

@Injectable()
export class UploadImageService {
  private readonly logger = new Logger(UploadImageService.name);

  constructor(
    private readonly refImageRepository: RefImageRepository,
    private readonly promptGuideImageRepository: PromptGuideImageRepository,
    private readonly tosService: TosService,
    private readonly storageUrl: StorageUrlService,
    private readonly access: UploadAccessService,
    private readonly galleryRepository: GalleryRepository,
  ) {}

  async deleteImage(uid: string, user?: AuthUser) {
    const bucketName = tosConfigs().tosBucket;
    const file = await this.refImageRepository.findOne({
      where: {
        uid: uid,
      },
    });
    if (!file) {
      throw new ConflictException('File not found');
    }
    await this.access.assertCanManageRef(user, file);
    await this.refImageRepository.deleteMany({
      where: {
        uid: uid,
      },
    });
    await this.tosService.deleteObject(bucketName, file.imagePath);
  }
  async uploadImageFromPrompt(
    userId: string,
    index: number,
    projectId: string,
    generateType: UploadGenerateType,
    uid: string,
    refUid: string,
    organizationId: string,
    user?: AuthUser,
  ) {
    this.access.assertSameUser(user, userId);
    await this.access.assertCanWrite(user, { organizationId, projectId });
    const image = await this.promptGuideImageRepository.findOne({
      where: { uid: refUid },
    });
    const bucketname = tosConfigs().tosBucket;

    if (image) {
      const ext = path.extname(image.imageName);
      const oldImagePath = `${image.imagePath}`;
      const newImagePath = buildUploadKey(organizationId, projectId, uid, ext);
      console.log(bucketname);
      console.log(oldImagePath);
      console.log(newImagePath);
      // Copy file in Minio
      await this.tosService.copyObject(
        bucketname,
        oldImagePath, // Dest filename
        newImagePath, // Source path (bucket/filename)
      );
      const newImage = await this.refImageRepository.create({
        data: {
          uid: uid,
          userId: userId,
          projectId: projectId,
          index: index,
          imageName: image.imageName,
          imagePath: newImagePath, // Use new image path logic
          imageType: image.imageType,
          imageSize: image.imageSize,
          generateType: generateType,
          status: 'waiting',
        },
      });
      // Logger.debug(newImage);
      if (newImage) {
        return {
          uid: uid,
          name: image.imageName,
          url: await this.storageUrl.toDisplayUrl(newImagePath),
          imagePath: newImagePath,
          status: 'waiting', //waiting,processing,done
        };
      } else {
        throw new Error('Failed to get image');
      }
    }
  }
  async deletePromptGuideImage(uid: string, user?: AuthUser) {
    const file = await this.promptGuideImageRepository.findOne({
      where: {
        uid: uid,
      },
    });
    if (!file) {
      throw new ConflictException('File not found');
    }
    await this.access.assertCanManagePromptGuideImage(user, file);
    const bucketname = tosConfigs().tosBucket;
    await this.promptGuideImageRepository.deleteMany({
      where: {
        uid: uid,
      },
    });
    await this.tosService.deleteObject(bucketname, file.imagePath);
  }

  /**
   * ขั้นแรกของ direct upload: จอง row (status `uploading`) แล้วคืน presigned PUT URL
   * ให้ browser อัปโหลดตรงเข้า TOS
   * @throws BadRequestException เมื่อชนิด/ขนาดไฟล์ไม่ผ่าน หรือข้อมูลอ้างอิงไม่ครบ
   */
  async presignUpload(input: PresignUploadInput, user?: AuthUser) {
    await this.access.assertCanWrite(user, {
      organizationId: input.organizationId,
      projectId:
        input.kind === 'ref' || input.kind === 'editor-export'
          ? input.projectId
          : undefined,
      promptGuideId:
        input.kind === 'prompt-guide' ? input.promptGuideId : undefined,
    });
    if (!input.uid || !input.organizationId || !input.fileName) {
      throw new BadRequestException(
        'uid, organizationId and fileName are required',
      );
    }
    const mediaType = mediaTypeOfMime(input.contentType);
    if (!mediaType) {
      throw new BadRequestException(
        `Unsupported file type: ${input.contentType}`,
      );
    }
    const maxBytes = MAX_BYTES_BY_MEDIA[mediaType];
    if (!(input.size > 0) || input.size > maxBytes) {
      throw new BadRequestException(
        `File size must be 1..${maxBytes} bytes for ${mediaType}`,
      );
    }
    const ext = path.extname(input.fileName);
    if (input.kind === 'editor-export') {
      return this.presignEditorExport(input, ext, user);
    }
    // presigned PUT ผูก Content-Type ไม่ได้ — อย่างน้อยนามสกุลของ key ต้องตรงกับชนิดที่ประกาศ
    if (!isExtensionAllowed(input.contentType, ext)) {
      throw new BadRequestException(
        `File extension ${ext} does not match ${input.contentType}`,
      );
    }
    const row = {
      uid: input.uid,
      userId: input.userId,
      index: input.index,
      imageName: input.fileName,
      imageType: input.contentType,
      imageSize: input.size,
      generateType: input.generateType,
      status: STATUS_UPLOADING,
    };
    let imagePath: string;
    if (input.kind === 'ref') {
      if (!input.projectId)
        throw new BadRequestException('projectId is required');
      imagePath = buildUploadKey(
        input.organizationId,
        input.projectId,
        input.uid,
        ext,
      );
      await this.refImageRepository.create({
        data: { ...row, projectId: input.projectId, imagePath },
      });
    } else if (input.kind === 'prompt-guide') {
      if (!input.promptGuideId)
        throw new BadRequestException('promptGuideId is required');
      imagePath = buildPromptGuideKey(input.organizationId, input.uid, ext);
      await this.promptGuideImageRepository.create({
        data: { ...row, promptGuideId: +input.promptGuideId, imagePath },
      });
    } else {
      throw new BadRequestException(
        `Unknown upload kind: ${String(input.kind)}`,
      );
    }
    return {
      uid: input.uid,
      imagePath,
      uploadUrl: this.tosService.getPreSignedPutUrl(
        tosConfigs().tosBucket,
        imagePath,
        PRESIGN_PUT_EXPIRES_SEC,
      ),
      expiresIn: PRESIGN_PUT_EXPIRES_SEC,
    };
  }

  /**
   * ขั้นสองของ direct upload: ตรวจไฟล์ที่ browser PUT เข้า TOS แล้วเปลี่ยน row เป็น `waiting`
   * ไฟล์ที่ชนิด/ขนาดไม่ผ่านจะถูกลบทั้ง object และ row
   * @returns shape เดียวกับ `uploadImage` / `uploadPromptGuideImage`
   */
  async confirmUpload(kind: DirectUploadKind, uid: string, user?: AuthUser) {
    if (kind === 'editor-export') return this.confirmEditorExport(uid, user);
    const repo =
      kind === 'ref'
        ? this.refImageRepository
        : kind === 'prompt-guide'
        ? this.promptGuideImageRepository
        : null;
    if (!repo)
      throw new BadRequestException(`Unknown upload kind: ${String(kind)}`);
    const file = await repo.findOne({
      where: { uid, status: STATUS_UPLOADING },
    });
    if (!file) throw new NotFoundException(`No pending upload for ${uid}`);
    if (kind === 'ref') {
      await this.access.assertCanManageRef(user, file as { userId: string; projectId: string });
    } else {
      await this.access.assertCanManagePromptGuideImage(
        user,
        file as { userId: string; promptGuideId: number | null },
      );
    }

    const bucketname = tosConfigs().tosBucket;
    const head = await this.tosService.headObject(bucketname, file.imagePath);
    if (!head) throw new BadRequestException('File has not been uploaded yet');

    const size = Number(head['content-length']);
    const rawType = head['content-type'];
    const contentType = typeof rawType === 'string' ? rawType : undefined;
    if (!isAllowedUpload(contentType, size)) {
      this.logger.warn(
        `Rejecting upload ${file.imagePath}: type=${contentType} size=${size}`,
      );
      await this.tosService.deleteObject(bucketname, file.imagePath);
      await repo.deleteMany({ where: { uid } });
      throw new BadRequestException(
        'Uploaded file type or size is not allowed',
      );
    }

    await repo.updateMany({
      where: { uid },
      data: { status: 'waiting', imageSize: size, imageType: contentType },
    });
    return {
      uid,
      name: file.imageName,
      url: await this.storageUrl.toDisplayUrl(file.imagePath),
      imagePath: file.imagePath,
      status: 'waiting',
    };
  }

  /**
   * จอง Gallery row (ยังไม่แสดงใน Library) แล้วคืน presigned PUT ไปยัง key output ของ video
   * — key เดียวกับที่ core ใช้ resolve URL ของ Gallery (`buildOutputKey`)
   */
  private async presignEditorExport(
    input: PresignUploadInput,
    ext: string,
    user?: AuthUser,
  ) {
    this.access.assertSameUser(user, input.userId);
    if (!input.projectId) throw new BadRequestException('projectId is required');
    // uid กลายเป็น Gallery.id (uuid)
    if (!UUID_RE.test(input.uid)) throw new BadRequestException('uid must be a UUID');
    if (input.contentType !== EDITOR_EXPORT_MIME || ext.toLowerCase() !== '.mp4') {
      throw new BadRequestException('Editor exports must be MP4 (video/mp4)');
    }
    const objectName = `${input.uid}.mp4`;
    const imagePath = buildOutputKey(
      input.organizationId,
      input.projectId,
      'video',
      objectName,
    );
    await this.galleryRepository.create({
      data: {
        id: input.uid,
        projectId: input.projectId,
        // FK ไป users.userId — ใช้ของ token เมื่อมี เพราะ row เก่าบางที่เก็บ sub
        userId: user?.userId ?? input.userId,
        imageUrl: objectName,
        resultUrl: [objectName],
        prompt: input.fileName,
        typeGenerate: 'video',
        featureType: EDITOR_FEATURE_TYPE,
        genneratedStatus: GALLERY_UPLOADING,
        status: false,
        usedCredit: 0,
        generateConfig: { source: 'video-editor', objectKey: imagePath },
      },
    });
    this.logger.log(`Editor export reserved ${imagePath} (${input.size} bytes)`);
    return {
      uid: input.uid,
      imagePath,
      uploadUrl: this.tosService.getPreSignedPutUrl(
        tosConfigs().tosBucket,
        imagePath,
        PRESIGN_PUT_EXPIRES_SEC,
      ),
      expiresIn: PRESIGN_PUT_EXPIRES_SEC,
    };
  }

  /** ตรวจ MP4 ใน TOS แล้วเปิดให้เห็นใน Library; ไฟล์ที่ไม่ผ่านถูกลบทั้ง object และ row */
  private async confirmEditorExport(uid: string, user?: AuthUser) {
    const row = await this.galleryRepository.findOne({
      where: { id: uid, featureType: EDITOR_FEATURE_TYPE, genneratedStatus: GALLERY_UPLOADING },
    });
    if (!row) throw new NotFoundException(`No pending upload for ${uid}`);
    await this.access.assertCanManageRef(user, row);
    const objectKey = editorObjectKey(row.generateConfig);
    if (!objectKey) throw new BadRequestException('Upload record is incomplete');

    const bucketname = tosConfigs().tosBucket;
    const head = await this.tosService.headObject(bucketname, objectKey);
    if (!head) throw new BadRequestException('File has not been uploaded yet');
    const size = Number(head['content-length']);
    const rawType = head['content-type'];
    const contentType = typeof rawType === 'string' ? rawType.split(';')[0].trim() : undefined;
    if (contentType !== EDITOR_EXPORT_MIME || !isAllowedUpload(contentType, size)) {
      this.logger.warn(
        `Rejecting editor export ${objectKey}: type=${contentType} size=${size}`,
      );
      await this.tosService.deleteObject(bucketname, objectKey);
      await this.galleryRepository.deleteMany({ where: { id: uid } });
      throw new BadRequestException('Uploaded file type or size is not allowed');
    }

    await this.galleryRepository.updateMany({
      where: { id: uid },
      data: { genneratedStatus: 'SUCCESS', status: true },
    });
    this.logger.log(`Editor export saved to library ${objectKey} (${size} bytes)`);
    return {
      uid,
      name: row.prompt ?? `${uid}.mp4`,
      url: await this.storageUrl.toDisplayUrl(objectKey),
      imagePath: objectKey,
      status: 'saved',
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleCron() {
    await this.deleteWaitingRefImage();
    await this.deleteWaitingPromptGuideImage();
    await this.deleteStaleEditorExports();
  }

  /** export ที่ขอ presign แล้วไม่ confirm ภายใน 24 ชม. (ปิดหน้า / upload ล้ม) */
  async deleteStaleEditorExports() {
    const rows = await this.galleryRepository.findMany({
      where: {
        featureType: EDITOR_FEATURE_TYPE,
        genneratedStatus: GALLERY_UPLOADING,
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    Logger.log(`Found ${rows.length} stale editor exports to delete`);
    for (const row of rows) {
      const objectKey = editorObjectKey(row.generateConfig);
      if (objectKey) {
        await this.tosService.deleteObject(tosConfigs().tosBucket, objectKey);
      }
      await this.galleryRepository.deleteMany({ where: { id: row.id } });
    }
  }
  async deleteWaitingRefImage() {
    const files = await this.refImageRepository.findMany({
      where: {
        status: { in: ['waiting', STATUS_UPLOADING] },
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });
    Logger.log(`Found ${files.length} files to delete`);
    for (const file of files) {
      const ext = path.extname(file.imagePath);
      await this.tosService.deleteObject(
        tosConfigs().tosBucket,
        file.imagePath,
      );
      await this.refImageRepository.deleteMany({
        where: {
          uid: file.uid,
        },
      });
    }
  }
  async deleteWaitingPromptGuideImage() {
    const files = await this.promptGuideImageRepository.findMany({
      where: {
        status: { in: ['waiting', STATUS_UPLOADING] },
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });
    // Logger.log(`Found ${files.length} files to delete`);
    for (const file of files) {
      await this.tosService.deleteObject(
        tosConfigs().tosBucket,
        file.imagePath,
      );
      await this.promptGuideImageRepository.deleteMany({
        where: {
          uid: file.uid,
        },
      });
    }
  }
}
