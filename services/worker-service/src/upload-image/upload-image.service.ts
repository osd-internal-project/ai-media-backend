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
  PromptGuideImageRepository,
  RefImageRepository,
  StorageUrlService,
  TosService,
  buildPromptGuideKey,
  buildUploadKey,
} from '@ai-media/share';
import { Cron, CronExpression } from '@nestjs/schedule';

/** ชนิดไฟล์ที่หน้าบ้านรับได้ (image/video/audio reference) */
const ALLOWED_UPLOAD_TYPES = ['image/', 'video/', 'audio/'];
/** เท่ากับ ingress proxy-body-size เดิม (500m) — ไม่ให้ direct upload เข้มกว่า/หลวมกว่า multipart */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const PRESIGN_PUT_EXPIRES_SEC = 15 * 60;
/** row ที่ออก presigned URL แล้วแต่ยังไม่ confirm — cron ลบทิ้งเมื่อค้างเกิน 24 ชม. */
const STATUS_UPLOADING = 'uploading';

export type DirectUploadKind = 'ref' | 'prompt-guide';

export interface PresignUploadInput {
  kind: DirectUploadKind;
  userId: string;
  index: number;
  uid: string;
  organizationId: string;
  generateType: 'image' | 'video';
  fileName: string;
  contentType: string;
  size: number;
  /** kind = 'ref' */
  projectId?: string;
  /** kind = 'prompt-guide' */
  promptGuideId?: string;
}

function isAllowedType(contentType: string | undefined): boolean {
  return (
    !!contentType &&
    ALLOWED_UPLOAD_TYPES.some((prefix) => contentType.startsWith(prefix))
  );
}

@Injectable()
export class UploadImageService {
  private readonly logger = new Logger(UploadImageService.name);

  constructor(
    private readonly refImageRepository: RefImageRepository,
    private readonly promptGuideImageRepository: PromptGuideImageRepository,
    private readonly tosService: TosService,
    private readonly storageUrl: StorageUrlService,
  ) {}

  async deleteImage(uid: string) {
    const bucketName = tosConfigs().tosBucket;
    const file = await this.refImageRepository.findOne({
      where: {
        uid: uid,
      },
    });
    if (!file) {
      throw new ConflictException('File not found');
    }
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
    generateType: 'image' | 'video',
    uid: string,
    refUid: string,
    organizationId: string,
  ) {
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
  async deletePromptGuideImage(uid: string) {
    const file = await this.promptGuideImageRepository.findOne({
      where: {
        uid: uid,
      },
    });
    if (!file) {
      throw new ConflictException('File not found');
    }
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
  async presignUpload(input: PresignUploadInput) {
    if (!input.uid || !input.organizationId || !input.fileName) {
      throw new BadRequestException(
        'uid, organizationId and fileName are required',
      );
    }
    if (!isAllowedType(input.contentType)) {
      throw new BadRequestException(
        `Unsupported file type: ${input.contentType}`,
      );
    }
    if (!(input.size > 0) || input.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File size must be 1..${MAX_UPLOAD_BYTES} bytes`,
      );
    }
    const ext = path.extname(input.fileName);
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
  async confirmUpload(kind: DirectUploadKind, uid: string) {
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

    const bucketname = tosConfigs().tosBucket;
    const head = await this.tosService.headObject(bucketname, file.imagePath);
    if (!head) throw new BadRequestException('File has not been uploaded yet');

    const size = Number(head['content-length']);
    const rawType = head['content-type'];
    const contentType = typeof rawType === 'string' ? rawType : undefined;
    if (!isAllowedType(contentType) || !(size > 0) || size > MAX_UPLOAD_BYTES) {
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

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleCron() {
    await this.deleteWaitingRefImage();
    await this.deleteWaitingPromptGuideImage();
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
