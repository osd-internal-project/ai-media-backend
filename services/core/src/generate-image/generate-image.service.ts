import { Prisma } from '@prisma/client';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  LogRepository,
  GalleryRepository,
  MasterDataConfigApiRepository,
  UsersRepository,
} from '@ai-media/share';
import { Injectable, Logger } from '@nestjs/common';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import axios from 'axios';
import * as https from 'https';
import configs from 'src/configs';
import { v4 as uuidv4 } from 'uuid';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
const baseUrl = configs().pathDomain;
const { minioBucket, minioBucketVdo } = configs();
@Injectable()
export class GenerateImageService {
  constructor(
    private readonly generateimagerepo: GenerateImageRepository,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
    private readonly masterdataconfigapiRepo: MasterDataConfigApiRepository,
    private readonly userRepo: UsersRepository,
    private readonly minioclientSerives: MinioClientService,
  ) { }
  async create(createGenerateImageDto: CreateGenerateImageDto) {
    const uuid = uuidv4();
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

    if (createGenerateImageDto.type === 'vdo') {
      const totalVDOGenerate = await this.logrepo.findMany({
        where: {
          userId: user.userId,
          typeGenerate: createGenerateImageDto.type,
          status: 'success',
        },
      });
      const totalTokenUsed = totalVDOGenerate.reduce(
        (sum, item) => sum + item.tokenUsed,
        0,
      );
      if (totalTokenUsed > user.maxToken) {
        return {
          status: 400,
          data: 'Token ที่คุณใช้เกินจำนวน กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มจำนวน Token',
        };
      }
      const imageArray = createGenerateImageDto.image;
      const imageCount =
        imageArray && Array.isArray(imageArray) ? imageArray.length : 0;
      let imageContents: any[] = [];
      if (imageCount === 1) {
        Logger.debug(`${baseUrl}/${imageArray[0]}`);
        imageContents.push({
          type: 'image_url',
          image_url: {
            url: `${baseUrl}/${imageArray[0]}`,
          },
        });
      } else if (imageCount >= 2) {
        imageContents.push(
          {
            type: 'image_url',
            image_url: { url: `${baseUrl}/${imageArray[0]}` },
            role: 'first_frame',
          },
          {
            type: 'image_url',
            image_url: { url: `${baseUrl}/${imageArray[1]}` },
            role: 'last_frame',
          },
        );
      }
      const base = {
        model: getModelType.modelType,
        content: [
          {
            type: 'text',
            text: `${createGenerateImageDto.text} --resolution ${createGenerateImageDto.resolution} --duration ${createGenerateImageDto.duration} --ratio ${createGenerateImageDto.ratio} --camerafixed false`,
          },
          ...imageContents,
        ],
      };

      const generateImage = await axios.post(
        `${getConfigApi.apiCreateTaskVdo}`,
        base,
        axiosConfig,
      );
      await this.logrepo.create({
        data: {
          taskId: generateImage.data.id,
          projectId: createGenerateImageDto.projectId,
          userId: user.userId,
          prompt: `${createGenerateImageDto.text} `,
          typeGenerate: createGenerateImageDto.type,
          status: 'pending',
          tokenUsed: 0,
          ImageUsed: 0,
        },
      });
      return { status: 200, data: generateImage.data };
    } else {
      const totalImageGenerate = await this.logrepo.findMany({
        where: {
          userId: user.userId,
          typeGenerate: createGenerateImageDto.type,
          status: 'success',
        },
      });
      const totalTokenUsed = totalImageGenerate.reduce(
        (sum, item) => sum + item.ImageUsed,
        0,
      );
      if (
        totalTokenUsed + Number(createGenerateImageDto.images) >
        user.maxImages
      ) {
        return {
          status: 400,
          data: 'Image ที่คุณใช้เกินจำนวน กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มจำนวน Image',
        };
      }
      const dataLogs = await this.logrepo.create({
        data: {
          taskId: uuid,
          projectId: createGenerateImageDto.projectId,
          userId: user.userId,
          prompt: `${createGenerateImageDto.text} `,
          typeGenerate: createGenerateImageDto.type,
          status: 'pending',
          tokenUsed: 0,
          ImageUsed: 0,
        },
      });
      const base = {
        model: getModelType.modelType,
        prompt: `create ${createGenerateImageDto.images} images ${createGenerateImageDto.text} `,
        ...(createGenerateImageDto.image &&
          createGenerateImageDto.image.length > 0 && {
          image:
            createGenerateImageDto.image.length === 1
              ? `${baseUrl}/${createGenerateImageDto.image[0]}`
              : createGenerateImageDto.image.map(
                (img) => `${baseUrl}/${img}`,
              ),
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
        watermark: getConfigApi.watermark,
      };

      const generateImage = await axios.post(
        `${getConfigApi.apiCreateImage}`,
        base,
        axiosConfig,
      );
      if (generateImage.data) {
        await this.logrepo.update({
          where: { id: dataLogs.id },
          data: {
            taskId: uuid,
            projectId: createGenerateImageDto.projectId,
            userId: user.userId,
            prompt: `${createGenerateImageDto.text}`,
            status: 'success',
            typeGenerate: createGenerateImageDto.type,
            tokenUsed: generateImage.data.usage.total_tokens,
            ImageUsed: generateImage.data.usage.generated_images,
          },
        });
        await Promise.all(generateImage.data.data.map(async (e) => {
          const res = await axios.get(e.url, {
            responseType: 'arraybuffer',
            httpsAgent: agent,
          });
          const buffer = Buffer.from(res.data);
          const uuidName = uuidv4();
          const pathname = e.url;
          const fileNameFromPath = pathname.split('/').pop(); // '021763417932265c5f50319cb4d4388d7836967b82aebe55a0b1e_0.jpeg'
          let ext = fileNameFromPath.split('.').pop(); // 'jpeg'
          if (!ext || ext.length > 5) {
            ext = 'jpg';
          }
          const objectName = `${uuid}/${uuidName}.${ext}`;
          await this.minioclientSerives.uploadFile(
            buffer,
            buffer.length,
            minioBucket,
            objectName,
          );
          return await this.galleryRepo.create({
            data: {
              taskId: uuid,
              projectId: createGenerateImageDto.projectId,
              userId: user.userId,
              prompt: `${createGenerateImageDto.text}`,
              // imageUrl: e.url,
              imageUrl: objectName,
              typeGenerate: 'image',
            },
          });
        }));
      }
      return { status: 200, data: generateImage.data };
    }
  }

  findAll(query: any, skip: number, take: number) {
    return `This action returns all GenerateImage`;
  }

  async findOne(id: string) {
    const logByTaskId = await this.logrepo.findOne({ where: { taskId: id } });
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
    if (responseImage.data.status === 'succeeded') {
      const res = await axios.get(responseImage.data.content.video_url, {
        responseType: 'arraybuffer',
        httpsAgent: agent,
      });
      const buffer = Buffer.from(res.data);
      const uuidName = uuidv4();
      const pathname = responseImage.data.content.video_url;
      const fileNameFromPath = pathname.split('/').pop();
      let ext = fileNameFromPath.split('.').pop();
      if (!ext || ext.length > 5) {
        ext = 'mp4';
      }
      const objectName = `${responseImage.data.id}/${uuidName}.${ext}`;
      await this.minioclientSerives.uploadFile(
        buffer,
        buffer.length,
        minioBucketVdo,
        objectName,
      );
      await this.galleryRepo.create({
        data: {
          taskId: logByTaskId.taskId,
          projectId: logByTaskId.projectId,
          userId: logByTaskId.userId,
          imageUrl: objectName,
          prompt: logByTaskId.prompt,
          typeGenerate: 'vdo',
        },
      });
    }

    return responseImage.data;
  }

  update(id: number, updateGenerateImageDto: UpdateGenerateImageDto) {
    return `This action updates a #${id} GenerateImage`;
  }

  remove(id: number) {
    return `This action removes a #${id} GenerateImage`;
  }
  async upload(data) {
    const results = await Promise.all(
      data.map((item) =>
        this.generateimagerepo.create({
          data: {
            ...item,
          },
        }),
      ),
    );
    const fileNames = results.map((r) => r.fileName);

    return fileNames;
  }

  async createFileLogs(data) {
    return this.generateimagerepo.create({
      data: {
        ...data,
      },
    });
  }

  async findOneNew(id: string) {
    const logByTaskId = await this.logrepo.findOne({ where: { taskId: id } });
    // 1. ตั้งค่า Agent (ถ้าจำเป็นต้อง bypass SSL หรือ config พิเศษ)
    const agent = new https.Agent({
      rejectUnauthorized: false
    });


    try {
      // --- CODE ของคุณ ---
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
      if (responseImage.data.status === 'succeeded') {
        const res = await axios.get(responseImage.data.content.video_url, {
          responseType: 'arraybuffer',
          httpsAgent: agent,
        });
        // ------------------

        // 2. แปลง ArrayBuffer เป็น Node.js Buffer
        const videoBuffer = Buffer.from(res.data);
        const uuidName = uuidv4();
        const pathname = responseImage.data.content.video_url;
        const fileNameFromPath = pathname.split('/').pop();
        let ext = fileNameFromPath.split('.').pop();
        if (!ext || ext.length > 5) {
          ext = 'mp4';
        }
        // 3. สร้าง Mock File Object (จำลอง Multer File)
        // เพื่อให้ format ตรงกับที่ VideoService ต้องการ
        const mockFile: Express.Multer.File = {
          fieldname: 'file',
          originalname: `${uuidName}.${ext}`, // ตั้งชื่อไฟล์
          encoding: '7bit',
          mimetype: res.headers['content-type'] || 'video/mp4', // ดึง Type จาก Header
          buffer: videoBuffer, // ใส่ Buffer ที่ได้จาก Axios
          size: videoBuffer.length,
          stream: null,
          destination: '',
          filename: '',
          path: ''
        };

        // 4. ส่งเข้า Service ตัวเดิมเพื่อทำ Thumbnail + Upload MinIO
        const objectName = `${responseImage.data.id}/${uuidName}.${ext}`;
        const thumbObjectName = `${responseImage.data.id}/${uuidName}.webp`;
        const result = await this.minioclientSerives.uploadVideoWithThumbnail(minioBucketVdo, mockFile, responseImage.data.id);

        await this.galleryRepo.create({
          data: {
            taskId: logByTaskId.taskId,
            projectId: logByTaskId.projectId,
            userId: logByTaskId.userId,
            imageUrl: result.videoUrl,
            thumbnailUrl: result.thumbnailUrl,
            prompt: logByTaskId.prompt,
            typeGenerate: 'vdo',
          },
        });
        return {
          message: 'Download and process complete',
          data: result
        };
      }


    } catch (error) {
      console.error(error);
      throw new Error('Failed to process remote video');
    }
  }
}
