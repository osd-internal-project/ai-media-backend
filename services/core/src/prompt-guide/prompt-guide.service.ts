import { Injectable, Logger } from '@nestjs/common';
import {
  PromptGuideImageRepository,
  PromptGuideRepository,
  TosService,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { tosConfigs } from '../configs';

@Injectable()
export class PromptGuideService {
  constructor(
    private readonly promptguideRepo: PromptGuideRepository,
    private readonly promptGuideImageRepo: PromptGuideImageRepository,
    private readonly tosService: TosService,
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
      include: { promptGuideType: true },
    });
  }
  async findWithImageByTypes(promptGuideTypeId: number) {
    const bucketname = tosConfigs().tosBucket;

    const promptGuides = await this.promptguideRepo.findMany({
      where: {
        promptGuideTypeId,
      },
    });
    const templates = await Promise.all(
      promptGuides.map(async (promptGuide) => {
        const ImageUids = promptGuide?.promptGuideImages
          ? promptGuide.promptGuideImages
          : [];
        const images = [];

        await Promise.all(
          ImageUids.map(async (uid: string) => {
            const image = await this.promptGuideImageRepo.findOne({
              where: {
                uid: uid,
                status: 'completed',
              },
              orderBy: {
                index: 'asc',
              },
            });
            if (image) {
              const url = await this.tosService.getPreSignedUrl(
                bucketname,
                image?.imagePath || '',
              );
              images.push({
                uid: image?.uid,
                name: image?.imageName,
                url: url,
                imagePath: image?.imagePath,
                status: image?.status,
                index: image?.index,
              });
            }
          }),
        );
        return {
          ...promptGuide,
          images: images.sort((a, b) => a.index - b.index),
        };
      }),
    );
    return templates;
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

    const imagesWithUrls = await Promise.all(
      images.map(async (image) => {
        const url = await this.tosService.getPreSignedUrl(
          tosConfigs().tosBucket,
          image.imagePath,
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
