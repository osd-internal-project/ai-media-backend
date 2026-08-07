import { ConflictException, Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class UploadImageService {
  constructor(
    private readonly refImageRepository: RefImageRepository,
    private readonly promptGuideImageRepository: PromptGuideImageRepository,
    private readonly tosService: TosService,
    private readonly storageUrl: StorageUrlService,
  ) {}

  async uploadImage(
    userId: string,
    index: number,
    projectId: string,
    generateType: 'image' | 'video',
    file: Express.Multer.File,
    uid: string,
    organizationId: string,
  ) {
    const bucketname = tosConfigs().tosBucket;
    const ext = path.extname(file.originalname);
    const imagePath = buildUploadKey(organizationId, projectId, uid, ext);
    await this.tosService.putObject(bucketname, imagePath, file.buffer);
    await this.refImageRepository.create({
      data: {
        uid: uid,
        userId: userId,
        projectId: projectId,
        index: index,
        imageName: file.originalname,
        imagePath: imagePath,
        imageType: file.mimetype,
        imageSize: file.size,
        generateType: generateType,
        status: 'waiting',
      },
    });
    return {
      uid: uid,
      name: file.originalname,
      url: await this.storageUrl.toDisplayUrl(imagePath),
      imagePath: imagePath,
      status: 'waiting', //waiting,processing,done
    };
  }
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
  async uploadPromptGuideImage(
    userId: string,
    index: number,
    promptGuideId: string,
    generateType: 'image' | 'video',
    file: Express.Multer.File,
    uid: string,
    organizationId: string,
  ) {
    const bucketname = tosConfigs().tosBucket;
    const ext = path.extname(file.originalname);
    const imagePath = buildPromptGuideKey(organizationId, uid, ext);
    await this.tosService.putObject(bucketname, imagePath, file.buffer);
    const uploadedImage = await this.promptGuideImageRepository.create({
      data: {
        uid: uid,
        userId: userId,
        index: index,
        promptGuideId: +promptGuideId,
        imageName: file.originalname,
        imagePath: imagePath,
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
      url: await this.storageUrl.toDisplayUrl(imagePath),
      imagePath: imagePath,
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
    const bucketname = tosConfigs().tosBucket;
    await this.promptGuideImageRepository.deleteMany({
      where: {
        uid: uid,
      },
    });
    await this.tosService.deleteObject(bucketname, file.imagePath);
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
        status: 'waiting',
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
