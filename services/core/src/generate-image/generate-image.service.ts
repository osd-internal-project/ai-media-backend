import { Prisma } from '@prisma/client';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
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
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
  ) { }
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
                  url: `https://econnect.osd.co.th/namecard/public/api/core/public/generate-image/${createGenerateImageDto.image}`,
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
        // : 'seedream-3-0-t2i-250415',
        prompt: `${createGenerateImageDto.text}`,
        ...(createGenerateImageDto.image && {
          image: `https://econnect.osd.co.th/namecard/public/api/core/public/generate-image/${createGenerateImageDto.image}`,
          response_format: 'url',
          size: 'adaptive',
          seed: 21,
          guidance_scale: 5.5,
          watermark: true,
        }),
      };
      const generateImage = await axios.post(
        'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations',
        base,
        axiosConfig,
      );
      return generateImage.data;
    }
  }

  findAll(query: any, skip: number, take: number) {
    console.log(query);
    console.log(skip);
    console.log(take);

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
