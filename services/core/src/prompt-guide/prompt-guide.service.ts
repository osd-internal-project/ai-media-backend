import { Injectable } from '@nestjs/common';
import { CreatePromptGuideDto } from './dto/create-prompt-guide.dto';
import { UpdatePromptGuideDto } from './dto/update-prompt-guide.dto';
import {
  PromptGuideImageRepository,
  PromptGuideRepository,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { MinioClientService } from '../minio-client/minio-client.service';
import { minioConfigs } from '../configs';
import * as path from 'path';

@Injectable()
export class PromptGuideService {
  constructor(
    private readonly promptguideRepo: PromptGuideRepository,
    private readonly promptGuideImageRepo: PromptGuideImageRepository,
    private readonly minioClientService: MinioClientService,
  ) {}
  create(createPromptGuideDto: Prisma.PromptGuideCreateInput) {
    const data = {
      ...createPromptGuideDto,
      organizationId: createPromptGuideDto.organizationId || null,
    };
    return this.promptguideRepo.create({ data });
  }

  findAll() {
    return this.promptguideRepo.findMany({});
  }

  findOne(id: number) {
    return this.promptguideRepo.findOne({ where: { id } });
  }

  async update(
    id: number,
    updatePromptGuideDto: Prisma.PromptGuideUpdateInput,
  ) {
    const data = {
      ...updatePromptGuideDto,
      organizationId: updatePromptGuideDto.organizationId || null,
    };

    // this.promptGuideImageRepo.update({ where: {d: id } });
    const updated = await this.promptguideRepo.update({
      where: {
        id,
      },
      data,
    });
    if (updated) {
      const images = updatePromptGuideDto.promptGuideImages
        ? (updatePromptGuideDto.promptGuideImages as string[])
        : [];
      images?.map(async (image: string) => {
        await this.promptGuideImageRepo.update({
          where: {
            uid: image,
          },
          data: {
            status: 'completed',
          },
        });
      });
    }
    return updated;
  }

  remove(id: number) {
    return this.promptguideRepo.delete({ where: { id } });
  }

  findByOrganization(organizationId: string) {
    return this.promptguideRepo.findMany({
      where: {
        organizationId,
      },
    });
  }

  findImagesByPromptGuideId(promptGuideId: number) {
    return this.promptGuideImageRepo.findMany({
      where: {
        promptGuideId,
        status: 'completed',
      },
      orderBy: {
        index: 'asc',
      },
    });
  }

  async getPromptGuideImages(promptGuideId: number) {
    const images = await this.promptGuideImageRepo.findMany({
      where: {
        promptGuideId,
        status: 'completed',
      },
      orderBy: {
        index: 'asc',
      },
    });

    const bucketname = minioConfigs().minioBucketUpload;
    const imagesWithUrls = await Promise.all(
      images.map(async (image) => {
        const ext = path.extname(image.imagePath);
        const url = await this.minioClientService.getPresignedUrl(
          bucketname,
          `${image.uid}${ext}`,
        );
        return {
          uid: image.uid,
          name: image.imageName,
          url: url,
          status: image.status,
          index: image.index,
        };
      }),
    );

    return imagesWithUrls;
  }
}
