import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { MinioClientService } from '../minio-client/minio-client.service';
import { appConfigs } from '../configs';
import {
  PromptGuideImageRepository,
  RefImageRepository,
} from '@ai-media/share';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class UploadImageService {
  constructor(
    private readonly minioClientSerives: MinioClientService,
    private readonly refImageRepository: RefImageRepository,
    private readonly promptGuideImageRepository: PromptGuideImageRepository,
  ) { }

  async uploadImage(
    userId: string,
    index: number,
    projectId: string,
    generateType: 'image' | 'vdo',
    file: Express.Multer.File,
    uid: string,
  ) {
    const bucketname = appConfigs().minioBucketUpload;
    const ext = path.extname(file.originalname);
    await this.minioClientSerives.uploadFile(
      file.buffer,
      file.buffer.length,
      bucketname,
      `${uid}${ext}`,
    );
    await this.refImageRepository.create({
      data: {
        uid: uid,
        userId: userId,
        projectId: projectId,
        index: index,
        imageName: file.originalname,
        imagePath: `${bucketname}/${uid}${ext}`,
        imageType: file.mimetype,
        imageSize: file.size,
        generateType: generateType,
        status: 'waiting',
      },
    });
    return {
      uid: uid,
      name: file.originalname,
      url: await this.minioClientSerives.getPresignedUrl(
        bucketname,
        `${uid}${ext}`,
      ),
      imagePath: `${uid}${ext}`,
      status: 'waiting',//waiting,processing,done
    };
  }
  async deleteImage(uid: string) {
    const file = await this.refImageRepository.findOne({
      where: {
        uid: uid,
      },
    });
    if (!file) {
      throw new ConflictException('File not found');
    }
    const ext = path.extname(file.imagePath);
    await this.refImageRepository.deleteMany({
      where: {
        uid: uid,
      },
    });
    await this.minioClientSerives.deleteFile(
      `${uid}${ext}`,
      appConfigs().minioBucketUpload,
    );
  }

  async uploadPromptGuideImage(
    userId: string,
    index: number,
    promptGuideId: string,
    generateType: 'image' | 'vdo',
    file: Express.Multer.File,
    uid: string,
  ) {
    const bucketname = appConfigs().minioBucketUpload;
    const ext = path.extname(file.originalname);
    await this.minioClientSerives.uploadFile(
      file.buffer,
      file.buffer.length,
      bucketname,
      `${uid}${ext}`,
    );
    const uploadedImage = await this.promptGuideImageRepository.create({
      data: {
        uid: uid,
        userId: userId,
        index: index,
        promptGuideId: +promptGuideId,
        imageName: file.originalname,
        imagePath: `${bucketname}/${uid}${ext}`,
        imageType: file.mimetype,
        imageSize: file.size,
        generateType: generateType,
        status: 'waiting',
      },
    });
    Logger.debug(uploadedImage);
    return {
      uid: uid,
      name: file.originalname,
      url: await this.minioClientSerives.getPresignedUrl(bucketname, uid),
      status: 'waiting', //waiting,processing,done
    };
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
    const ext = path.extname(file.imagePath);
    await this.promptGuideImageRepository.deleteMany({
      where: {
        uid: uid,
      },
    });
    await this.minioClientSerives.deleteFile(
      `${uid}${ext}`,
      appConfigs().minioBucketUpload,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleCron() {
    await this.deleteWaitingRefImage();
    await this.deleteWaitingPromptGuideImage();
  }
  async deleteWaitingRefImage() {
    const files = await this.refImageRepository.findMany({
      where: {
        status: 'waiting',
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });
    Logger.log(`Found ${files.length} files to delete`);
    for (const file of files) {
      const ext = path.extname(file.imagePath);
      await this.minioClientSerives.deleteFile(
        `${file.uid}${ext}`,
        appConfigs().minioBucketUpload,
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
        status: 'waiting',
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });
    Logger.log(`Found ${files.length} files to delete`);
    for (const file of files) {
      const ext = path.extname(file.imagePath);
      await this.minioClientSerives.deleteFile(
        `${file.uid}${ext}`,
        appConfigs().minioBucketUpload,
      );
      await this.promptGuideImageRepository.deleteMany({
        where: {
          uid: file.uid,
        },
      });
    }
  }
}
