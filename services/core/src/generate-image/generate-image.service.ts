import { Prisma } from '@prisma/client';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  LogRepository,
  GalleryRepository,
} from '@ai-media/share';
import { Injectable } from '@nestjs/common';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import axios from 'axios';
import * as https from 'https';
@Injectable()
export class GenerateImageService {
  constructor(
    private readonly generateimagerepo: GenerateImageRepository,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
  ) {}
  async create(createGenerateImageDto: CreateGenerateImageDto) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer e7bcde05-22d1-479d-9afb-2870ba7d97ec',
      },
      httpsAgent: agent,
    };
    const description = createGenerateImageDto.image
      ? 'image-to-image'
      : 'text-to-image';
    const getModelType = await this.modeltypeRepo.findOne({
      where: {
        type: createGenerateImageDto.type,
        description: description,
      },
    } as Prisma.MasterModelTypeFindFirstArgs);
    await this.logrepo.create({
      data: {
        projectId: 'a4e7e905-b338-4f7a-8be1-7b5fdb748038',
        userId: '40a3e520-94bc-46ff-b892-527ea27dae4b',
        prompt: `${createGenerateImageDto.text} status:pending`,
        tokenUsed: 0,
        ImageUsed: 0,
      },
    });
    if (createGenerateImageDto.type === 'vdo') {
      const base = {
        model: getModelType.modelType,
        content: [
          {
            type: 'text',
            text: `${createGenerateImageDto.text} --resolution ${createGenerateImageDto.resolution} --duration ${createGenerateImageDto.duration} --ratio ${createGenerateImageDto.ratio} --camerafixed false`,
          },
          ...(createGenerateImageDto.image
            ? [
                {
                  type: 'image_url',
                  image_url: {
                    url: `http://192.168.31.181/public/api/core/public/generate-image/${createGenerateImageDto.image}`,
                  },
                },
              ]
            : []),
        ],
      };
      const generateImage = await axios.post(
        'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks',
        base,
        axiosConfig,
      );
      return generateImage.data;
    } else {
      const base = {
        model: getModelType.modelType,
        prompt: `${createGenerateImageDto.text} ช่วยออกแบบมา ${createGenerateImageDto.images} รูป`,
        ...(createGenerateImageDto.image && {
          image: `http://192.168.31.181/public/api/core/public/generate-image/${createGenerateImageDto.image} `,
        }),
        response_format: 'url',
        ...(createGenerateImageDto.resolution && {
          size: createGenerateImageDto.resolution,
        }),
        ...(createGenerateImageDto.images && {
          sequential_image_generation: 'auto',
          sequential_image_generation_options: {
            max_images: 10,
          },
        }),
        stream: false,
        optimize_prompt_options: {
          mode: 'fast',
        },
        watermark: false,
      };

      const generateImage = await axios.post(
        'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations',
        base,
        axiosConfig,
      );
      if (generateImage.data) {
        await this.logrepo.create({
          data: {
            projectId: 'a4e7e905-b338-4f7a-8be1-7b5fdb748038',
            userId: '40a3e520-94bc-46ff-b892-527ea27dae4b',
            prompt: `${createGenerateImageDto.text} status:success`,
            tokenUsed: generateImage.data.usage.total_tokens,
            ImageUsed: generateImage.data.usage.generated_images,
          },
        });
        generateImage.data.data.map(async (e) => {
          return await this.galleryRepo.create({
            data: {
              projectId: 'a4e7e905-b338-4f7a-8be1-7b5fdb748038',
              userId: '40a3e520-94bc-46ff-b892-527ea27dae4b',
              prompt: `${createGenerateImageDto.text} status:success`,
              imageUrl: e.url,
            },
          });
        });
      }
      return generateImage.data;
    }
  }

  findAll(query: any, skip: number, take: number) {
    return `This action returns all GenerateImage`;
  }

  async findOne(id: string) {
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });
    const responseImage = await axios.get(
      `https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/${id}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer e7bcde05-22d1-479d-9afb-2870ba7d97ec',
        },
        httpsAgent: agent,
      },
    );
    return responseImage.data;
  }

  update(id: number, updateGenerateImageDto: UpdateGenerateImageDto) {
    return `This action updates a #${id} GenerateImage`;
  }

  remove(id: number) {
    return `This action removes a #${id} GenerateImage`;
  }
  async upload(data) {
    return await this.generateimagerepo.create({
      data: {
        ...data,
      },
    });
  }
}
