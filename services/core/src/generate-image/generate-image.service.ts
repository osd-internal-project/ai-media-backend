import { Prisma } from '@prisma/client';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  LogRepository,
  GalleryRepository,
  MasterDataConfigApiRepository,
  UsersRepository,
} from '@ai-media/share';
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import axios from 'axios';
import * as https from 'https';
import configs from 'src/configs';
const baseUrl = configs().pathDomain;
@Injectable()
export class GenerateImageService {
  constructor(
    private readonly generateimagerepo: GenerateImageRepository,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
    private readonly masterdataconfigapiRepo: MasterDataConfigApiRepository,
    private readonly userRepo: UsersRepository,
  ) {}
  async create(createGenerateImageDto: CreateGenerateImageDto) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const getConfigApi = await this.masterdataconfigapiRepo.findOne({
      where: { id: 1 },
    } as Prisma.MasterDataConfigApiFindFirstArgs);

    const user = await this.userRepo.findOne({
      where: { token: createGenerateImageDto.userId },
    });
    const axiosConfig = {
      headers: {
        'Content-Type': `${getConfigApi.configType}`,
        Authorization: `${getConfigApi.authorization}`,
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
        projectId: createGenerateImageDto.projectId,
        userId: user.userId,
        prompt: `${createGenerateImageDto.text} `,
        typeGenerate: createGenerateImageDto.type,
        status: 'pending',
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
                    image: `${baseUrl}/${createGenerateImageDto.image}`,
                  },
                },
              ]
            : []),
        ],
      };
      const generateImage = await axios.post(
        // 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks',
        `${getConfigApi.apiCreateTaskVdo}`,
        base,
        axiosConfig,
      );
      return generateImage.data;
    } else {
      const base = {
        model: getModelType.modelType,
        prompt: `${createGenerateImageDto.text} ช่วยออกแบบมา ${createGenerateImageDto.images} รูป`,
        ...(createGenerateImageDto.image && {
          image: `${baseUrl}/${createGenerateImageDto.image}`,
        }),
        response_format: 'url',
        ...(createGenerateImageDto.width &&
          createGenerateImageDto.height && {
            size: `${createGenerateImageDto.width}x${createGenerateImageDto.height}`,
          }),
        ...(createGenerateImageDto.images && {
          sequential_image_generation: 'auto',
          sequential_image_generation_options: {
            max_images: getConfigApi.maxImage,
          },
        }),
        stream: getConfigApi.stream,
        optimize_prompt_options: {
          mode: 'fast',
        },
        watermark: getConfigApi.watermark,
      };
      console.log('body =>', base);
      console.log('createGenerateImageDto', createGenerateImageDto);

      // console.log(getConfigApi.apiCreateImage);
      // console.log(axiosConfig);

      // 'https://ark.ap-southeast.bytepluses.com/api/v3/images/generations',
      const generateImage = await axios.post(
        `${getConfigApi.apiCreateImage}`,
        base,
        axiosConfig,
      );

      console.log('response data', generateImage.data);
      if (generateImage.data) {
        await this.logrepo.create({
          data: {
            projectId: createGenerateImageDto.projectId,
            userId: user.userId,
            prompt: `${createGenerateImageDto.text}`,
            status: 'success',
            typeGenerate: createGenerateImageDto.type,
            tokenUsed: generateImage.data.usage.total_tokens,
            ImageUsed: generateImage.data.usage.generated_images,
          },
        });
        generateImage.data.data.map(async (e) => {
          return await this.galleryRepo.create({
            data: {
              projectId: createGenerateImageDto.projectId,
              userId: user.userId,
              prompt: `${createGenerateImageDto.text}`,
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
    console.log(data);
    return await this.generateimagerepo.create({
      data: {
        ...data,
      },
    });
  }
}
