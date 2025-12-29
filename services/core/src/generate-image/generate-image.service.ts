import { Prisma } from '@prisma/client';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  LogRepository,
  GalleryRepository,
  MasterDataConfigApiRepository,
  UsersRepository,
  OrganizationRepository,
  OrganizationMemberRepository,
} from '@ai-media/share';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import axios from 'axios';
import * as https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { ConfigType } from '@nestjs/config';
import { minioConfigs } from 'src/configs';
@Injectable()
export class GenerateImageService {
  constructor(
    @Inject(minioConfigs.KEY)
    private minioconfig: ConfigType<typeof minioConfigs>,
    private readonly generateimagerepo: GenerateImageRepository,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
    private readonly masterdataconfigapiRepo: MasterDataConfigApiRepository,
    private readonly userRepo: UsersRepository,
    private readonly minioClientSerives: MinioClientService,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
  ) {}
  async create(createGenerateImageDto: CreateGenerateImageDto) {
    const uuid = uuidv4();
    const agent = new https.Agent({ rejectUnauthorized: false });
    const getConfigApi = await this.masterdataconfigapiRepo.findOne({
      where: { id: 1 },
    } as Prisma.MasterDataConfigApiFindFirstArgs);
    const user = await this.userRepo.findOne({
      where: { token: createGenerateImageDto.userId },
    });
    const organizationMember = await this.organizationMemberRepo.findOne({
      where: { organizationId: user.recentOrganizationId },
    });
    const axiosConfig = {
      headers: {
        'Content-Type': `${getConfigApi.configType}`,
        Authorization: `${getConfigApi.authorization}`,
      },
      httpsAgent: agent,
    };

    const description =
      createGenerateImageDto.type === 'vdo'
        ? createGenerateImageDto.image
          ? 'image-to-video'
          : 'text-to-video'
        : createGenerateImageDto.image
        ? 'image-to-image'
        : 'text-to-image';
    const getModelType = createGenerateImageDto.modelName
      ? await this.modeltypeRepo.findOne({
          where: {
            modelType: createGenerateImageDto.modelName,
            type: createGenerateImageDto.type,
          },
        } as Prisma.MasterModelTypeFindFirstArgs)
      : await this.modeltypeRepo.findOne({
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

      if (totalTokenUsed > (organizationMember?.maxToken || 0)) {
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
        const imageUrl = await this.minioClientSerives.getPresignedUrl(
          this.minioconfig.minioBucketUpload,
          imageArray[0],
        );
        imageContents.push({
          type: 'image_url',
          image_url: {
            url: imageUrl,
          },
        });
      } else if (imageCount >= 2) {
        const imageUrl1 = await this.minioClientSerives.getPresignedUrl(
          this.minioconfig.minioBucketUpload,
          imageArray[0],
        );
        const imageUrl2 = await this.minioClientSerives.getPresignedUrl(
          this.minioconfig.minioBucketUpload,
          imageArray[1],
        );
        console.log(`Image URL 1: ${imageUrl1}`);
        console.log(`Image URL 2: ${imageUrl2}`);
        imageContents.push(
          {
            type: 'image_url',
            image_url: { url: imageUrl1 },
            role: 'first_frame',
          },
          {
            type: 'image_url',
            image_url: { url: imageUrl2 },
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

      const generateVideo = await axios.post(
        `${getConfigApi.apiCreateTaskVdo}`,
        base,
        axiosConfig,
      );
      if (!generateVideo.data.id) {
        Logger.error(`Error create task: ${generateVideo}`);
        return {
          status: 400,
          data: 'Error create task',
        };
      }
      await this.logrepo.create({
        data: {
          taskId: generateVideo.data.id,
          projectId: createGenerateImageDto.projectId,
          userId: user.userId,
          prompt: `${createGenerateImageDto.text} `,
          typeGenerate: createGenerateImageDto.type,
          status: 'pending',
          tokenUsed: 0,
          ImageUsed: 0,
          referenceImages: createGenerateImageDto.image || [],
          resolution: createGenerateImageDto.resolution || '2k',
          ratio: createGenerateImageDto.ratio || '1:1',
        },
      });
      return { status: 200, data: generateVideo.data };
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
          referenceImages: createGenerateImageDto.image || [],
          resolution: createGenerateImageDto.resolution || '2k',
          ratio: createGenerateImageDto.ratio || '1:1',
        },
      });
      let imageUrl = [];
      if (
        createGenerateImageDto.image &&
        createGenerateImageDto.image.length > 0
      ) {
        imageUrl = await Promise.all(
          createGenerateImageDto.image.map((img) =>
            this.minioClientSerives.getPresignedUrl(
              this.minioconfig.minioBucketUpload,
              img,
            ),
          ),
        );
      }

      if (!getModelType) {
        Logger.error(`Model not found: ${createGenerateImageDto.modelName}`);
        return {
          success: false,
          message: `Model not found: ${createGenerateImageDto.modelName}`,
          data: null,
        };
      }

      const base = {
        model: getModelType.modelType,
        prompt: `create ${createGenerateImageDto.images} images ${createGenerateImageDto.text} `,
        ...(imageUrl.length > 0 && {
          image: imageUrl.length === 1 ? imageUrl[0] : imageUrl,
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
      if (!generateImage.data) {
        Logger.error(`Error create task: ${generateImage}`);
        return {
          status: 400,
          data: 'Error create task',
        };
      }
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
        await Promise.all(
          generateImage.data.data.map(async (e) => {
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
            await this.minioClientSerives.uploadFile(
              buffer,
              buffer.length,
              this.minioconfig.minioBucket,
              objectName,
            );
            return await this.galleryRepo.create({
              data: {
                taskId: uuid,
                projectId: createGenerateImageDto.projectId,
                userId: user.userId,
                prompt: `${createGenerateImageDto.text}`,
                imageUrl: objectName,
                typeGenerate: 'image',
              },
            });
          }),
        );
      }
      return { status: 200, data: generateImage.data };
    }
  }

  findAll(query: any, skip: number, take: number) {
    return `This action returns all GenerateImage`;
  }

  async findOne(id: string) {
    const getConfigApi = await this.masterdataconfigapiRepo.findOne({
      where: { id: 1 },
    });
    const logByTaskId = await this.logrepo.findOne({ where: { taskId: id } });
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });
    const responseImage = await axios.get(
      `${getConfigApi}/${getConfigApi.apiCreateTaskVdo}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: getConfigApi.authorization,
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
      await this.minioClientSerives.uploadFile(
        buffer,
        buffer.length,
        this.minioconfig.minioBucketVdo,
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
      rejectUnauthorized: false,
    });
    const getConfigApi = await this.masterdataconfigapiRepo.findOne({
      where: { id: 1 },
    });
    try {
      // --- CODE ของคุณ ---
      const url = `${getConfigApi.apiCreateTaskVdo}/${id}`;
      const token = getConfigApi.authorization;
      const authHeader = token.startsWith('Bearer ')
        ? token
        : `Bearer ${token}`;

      // Logger.debug(`Request URL: ${url}`);
      // Logger.debug(`Authorization: ${authHeader}`);

      const videoRes = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        httpsAgent: agent,
      });
      // Logger.debug(`Response status: ${result.status}`);
      // Logger.debug(`Response data: ${JSON.stringify(result.data)}`);
      // if (!videoRes.data) {
      //   throw new Error('Video not found');
      // }
      if (
        videoRes.data.status === 'succeeded' &&
        videoRes.data.content.video_url
      ) {
        const videoUrl = videoRes.data.content.video_url;
        const res = await axios.get(videoUrl, {
          responseType: 'arraybuffer',
          httpsAgent: agent,
        });
        // ------------------
        Logger.debug(`Video URL: ${videoUrl}`);
        // Logger.debug(`Response data: ${JSON.stringify(res.data)}`);
        // 2. แปลง ArrayBuffer เป็น Node.js Buffer
        const videoBuffer = Buffer.from(res.data);
        const uuidName = uuidv4();
        const pathname = videoUrl;
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
          path: '',
        };

        // 4. ส่งเข้า Service ตัวเดิมเพื่อทำ Thumbnail + Upload MinIO

        // const objectName = `${responseImage.data.id}/${uuidName}.${ext}`;
        // const thumbnailFileName = `thumb-${Date.now()}.png`;
        const result = await this.minioClientSerives.uploadVideoWithThumbnail(
          this.minioconfig.minioBucketVdo,
          mockFile,
          id,
        );
        // Logger.debug(`Response Minio: ${JSON.stringify(result)}`);
        const resultGallery = await this.galleryRepo.create({
          data: {
            taskId: logByTaskId.taskId,
            projectId: logByTaskId.projectId,
            userId: logByTaskId.userId,
            imageUrl: result.file,
            thumbnailUrl: result.thumbnail || '',
            prompt: logByTaskId.prompt,
            typeGenerate: 'vdo',
          },
        });
        Logger.debug(`Response Gallery: ${JSON.stringify(resultGallery)}`);
        return videoRes.data;
      }

      return videoRes.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        Logger.error(`Axios error: ${error.message}`);
        if (error.response) {
          Logger.error(`Response status: ${error.response.status}`);
          Logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
        }
      } else {
        Logger.error(`Error: ${error}`);
      }
      throw error; // Re-throw the original error or a meaningful one
    }
  }
  // async createMinioFileUrl(bucketName: string, path: string) {
  //   const url = await this.minioclientSerives.getPresignedUrl(bucketName, path);
  //   const domain = this.appconfigs.pathPublicDomain;
  //   const ip = this.appconfigs.pathPublicIp;
  //   console.log(url.replace(ip, domain));
  //   return url.replace(ip, domain);
  // }
}
