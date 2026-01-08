import { Prisma } from '@prisma/client';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  LogRepository,
  GalleryRepository,
  MasterDataConfigApiRepository,
  UsersRepository,
  OrganizationMemberRepository,
} from '@ai-media/share';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import axios from 'axios';
import * as https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { ConfigType } from '@nestjs/config';
import { minioConfigs } from 'src/configs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Log } from 'src/logs/entities/log.entity';

@Injectable()
export class GenerateImageService implements OnModuleInit {
  private readonly logger = new Logger(GenerateImageService.name);
  private readonly agent = new https.Agent({ rejectUnauthorized: false });
  private hasPendingTasks = false;

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
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // Check if there are any pending tasks on startup to set the flag correctly
    const pendingTasks = await this.galleryRepo.findMany({
      where: {
        genneratedStatus: 'PROCESSING',
        taskId: { not: null },
        typeGenerate: 'vdo',
      },
      take: 1,
    });
    this.hasPendingTasks = pendingTasks.length > 0;
    if (this.hasPendingTasks) {
      this.logger.log('Restored pending VDO tasks monitoring.');
    }
  }

  async create(createGenerateImageDto: CreateGenerateImageDto) {
    console.log(createGenerateImageDto);
    // const uuid = uuidv4();

    // const getConfigApi = await this.masterdataconfigapiRepo.findOne({
    //   where: { id: 1 },
    // } as Prisma.MasterDataConfigApiFindFirstArgs);

    // const user = await this.userRepo.findOne({
    //   where: { token: createGenerateImageDto.userId },
    // });

    // // 1. Validate Quota
    // const organizationMember = await this.organizationMemberRepo.findOne({
    //   where: { organizationId: user.recentOrganizationId },
    // });

    // if (createGenerateImageDto.type === 'vdo') {
    //   const totalVDOGenerate = await this.logrepo.findMany({
    //     where: {
    //       userId: user.userId,
    //       typeGenerate: createGenerateImageDto.type,
    //       status: 'success',
    //     },
    //   });
    //   const totalTokenUsed = totalVDOGenerate.reduce(
    //     (sum, item) => sum + item.tokenUsed,
    //     0,
    //   );
    //   if (totalTokenUsed > (organizationMember?.maxToken || 0)) {
    //     return { status: 400, data: 'Token token limit exceeded' };
    //   }
    // } else {
    //   const totalImageGenerate = await this.logrepo.findMany({
    //     where: {
    //       userId: user.userId,
    //       typeGenerate: createGenerateImageDto.type,
    //       status: 'success',
    //     },
    //   });
    //   const totalTokenUsed = totalImageGenerate.reduce(
    //     (sum, item) => sum + item.ImageUsed,
    //     0,
    //   );
    //   if (
    //     totalTokenUsed + Number(createGenerateImageDto.images) >
    //     user.maxImages
    //   ) {
    //     return { status: 400, data: 'Image limit exceeded' };
    //   }
    // }

    // // 2. Create Gallery PENDING & Emit
    // const galleryItem = await this.galleryRepo.create({
    //   data: {
    //     taskId: createGenerateImageDto.type === 'image' ? uuid : null,
    //     projectId: createGenerateImageDto.projectId,
    //     userId: user.userId,
    //     prompt: createGenerateImageDto.text,
    //     typeGenerate: createGenerateImageDto.type,
    //     genneratedStatus: 'PENDING',
    //     imageUrl: '',
    //     status: false,
    //   },
    // });

    // this.eventEmitter.emit(
    //   `image.update.project.${createGenerateImageDto.projectId}`,
    //   {
    //     galleryId: galleryItem.id,
    //     status: 'PENDING',
    //     type: createGenerateImageDto.type,
    //   },
    // );

    // // 3. Prepare Request
    // const axiosConfig = {
    //   headers: {
    //     'Content-Type': `${getConfigApi.configType}`,
    //     Authorization: `${getConfigApi.authorization}`,
    //   },
    //   httpsAgent: this.agent,
    // };

    // const getModelType = await this.getModelType(createGenerateImageDto);
    // if (!getModelType) {
    //   await this.updateAndEmit(
    //     user.userId,
    //     galleryItem.projectId,
    //     galleryItem.id,
    //     'FAIL',
    //   );
    //   return { status: 400, data: 'Model not found' };
    // }

    // // 4. Send Request (Async execution to avoid blocking if needed, but here we wait for initial response)
    // try {
    //   if (createGenerateImageDto.type === 'vdo') {
    //     const taskId = await this.handleVdoRequest(
    //       createGenerateImageDto,
    //       getModelType,
    //       getConfigApi,
    //       axiosConfig,
    //       user,
    //       galleryItem,
    //     );
    //     if (taskId) {
    //       galleryItem.taskId = taskId;
    //     }
    //   } else {
    //     Logger.debug('handleImageRequest');
    //     await this.handleImageRequest(
    //       createGenerateImageDto,
    //       getModelType,
    //       getConfigApi,
    //       axiosConfig,
    //       user,
    //       galleryItem,
    //     );
    //   }
    // } catch (error) {
    //   this.logger.error(error);
    //   await this.updateAndEmit(
    //     user.userId,
    //     galleryItem.projectId,
    //     galleryItem.id,
    //     'FAIL',
    //   );
    //   // We do not return error status here because we want the frontend to know the task started (optimistic) and failed later via SSE
    //   // BUT the initial API return is also important.
    //   return { status: 500, data: 'Generation failed' };
    // }

    // return { status: 200, data: galleryItem };
  }

  // --- Handlers ---

  private async getModelType(dto: CreateGenerateImageDto) {
    const description =
      dto.type === 'vdo'
        ? dto.image
          ? 'image-to-video'
          : 'text-to-video'
        : dto.image
        ? 'image-to-image'
        : 'text-to-image';

    return dto.modelName
      ? await this.modeltypeRepo.findOne({
          where: { modelType: dto.modelName, type: dto.type },
        } as Prisma.MasterModelTypeFindFirstArgs)
      : await this.modeltypeRepo.findOne({
          where: { type: dto.type, description: description },
        } as Prisma.MasterModelTypeFindFirstArgs);
  }

  private async handleVdoRequest(
    dto,
    model,
    config,
    axiosConfig,
    user,
    gallery,
  ) {
    // Prepare Payload
    console.log('VDO 1');
    let imageContents: any[] = [];
    Logger.debug('dto.image', dto.image);
    if (dto.image && Array.isArray(dto.image)) {
      for (const img of dto.image) {
        const url = await this.minioClientSerives.getPresignedUrl(
          this.minioconfig.minioBucketUpload,
          img.fileName,
        );
        imageContents.push({
          type: 'image_url',
          image_url: { url },
          role: 'first_frame',
        });
      }
      if (dto.image.length >= 2) {
        const url1 = await this.minioClientSerives.getPresignedUrl(
          this.minioconfig.minioBucketUpload,
          dto.image[0].filePath,
        );
        const url2 = await this.minioClientSerives.getPresignedUrl(
          this.minioconfig.minioBucketUpload,
          dto.image[0].fileName,
        );
        imageContents = [
          { type: 'image_url', image_url: { url: url1 }, role: 'first_frame' },
          { type: 'image_url', image_url: { url: url2 }, role: 'last_frame' },
        ];
      } else if (dto.image.length === 1) {
        const url = await this.minioClientSerives.getPresignedUrl(
          this.minioconfig.minioBucketUpload,
          dto.image[0].fileName,
        );
        imageContents = [
          { type: 'image_url', image_url: { url }, role: 'first_frame' },
        ];
      }
    }
    const base = {
      model: model.modelType,
      generate_audio: dto.generateAudio,
      content: [
        {
          type: 'text',
          text: `${dto.text} --resolution ${dto.resolution} --duration ${dto.duration} --ratio ${dto.ratio} --camerafixed false`,
        },
        ...imageContents,
      ],
    };
    // const res = { data: { id: 'cgt-20260107165929-8ntxn' } };
    const res = await axios.post(
      `${config.apiCreateTaskVdo}`,
      base,
      axiosConfig,
    );
    Logger.debug(res.data);
    if (res.data.id) {
      // Async Task ID returned
      await this.galleryRepo.update({
        where: { id: gallery.id },
        data: { taskId: res.data.id, genneratedStatus: 'PROCESSING' },
      });
      await this.logrepo.create({
        data: {
          taskId: res.data.id,
          projectId: dto.projectId,
          userId: user.userId,
          prompt: dto.text,
          typeGenerate: dto.type,
          status: 'pending',
          tokenUsed: 0,
          ImageUsed: 0,
          referenceImages: dto.image.map((img) => img.fileName) || [],
          resolution: dto.resolution || '2k',
          ratio: dto.ratio || '1:1',
        },
      });

      this.eventEmitter.emit(`image.update.project.${dto.projectId}`, {
        galleryId: gallery.id,
        status: 'PROCESSING',
        taskId: res.data.id,
      });

      this.hasPendingTasks = true; // Enable Cron Loop
      return res.data.id;
    } else {
      throw new Error('No Task ID returned');
    }
  }

  private async handleImageRequest(
    dto,
    model,
    config,
    axiosConfig,
    user,
    gallery,
  ) {
    let imageUrls = [];
    if (dto.image && dto.image.length > 0) {
      imageUrls = await Promise.all(
        dto.image.map((img) =>
          this.minioClientSerives.getPresignedUrl(
            this.minioconfig.minioBucketUpload,
            img.fileName,
          ),
        ),
      );
    }

    const base = {
      model: model.modelType,
      prompt: `create ${dto.images} images ${dto.text} `,
      ...(imageUrls.length > 0 && {
        image: imageUrls.length === 1 ? imageUrls[0] : imageUrls,
      }),
      response_format: 'url',
      ...(dto.width && dto.height && { size: `${dto.width}x${dto.height}` }),
      ...(dto.images && {
        sequential_image_generation: 'auto',
        sequential_image_generation_options: { max_images: config.maxImage },
      }),
      stream: config.stream,
      watermark: config.watermark,
    };

    const res = await axios.post(`${config.apiCreateImage}`, base, axiosConfig);
    Logger.debug('IMAGE');
    // Logger.debug(res.data);
    // const res = {
    //   data: {
    //     model: 'seedream-4-5-251128',
    //     created: 1767754400,
    //     data: [
    //       {
    //         url: 'https://ark-content-generation-v2-ap-southeast-1.tos-ap-southeast-1.volces.com/seedream-4-5/021767754386697f9cb936a41ab283113693068986f31c38847cb_0.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256&X-Tos-Credential=AKLTYWJkZTExNjA1ZDUyNDc3YzhjNTM5OGIyNjBhNDcyOTQ%2F20260107%2Fap-southeast-1%2Ftos%2Frequest&X-Tos-Date=20260107T025320Z&X-Tos-Expires=86400&X-Tos-Signature=6f2d809fad69ae613c2443e05884633b08fd4c445928bc76bb6a0bfce3abbabc&X-Tos-SignedHeaders=host',
    //         size: '2048x2048',
    //       },
    //     ],
    //     usage: {
    //       generated_images: 1,
    //       output_tokens: 16384,
    //       total_tokens: 16384,
    //     },
    //   },
    // };
    if (res.data && res.data.data) {
      // Sync Response (URLs returned)
      await this.galleryRepo.update({
        where: { id: gallery.id },
        data: { genneratedStatus: 'PROCESSING' },
      });
      this.eventEmitter.emit(`image.update.project.${gallery.projectId}`, {
        galleryId: gallery.id,
        status: 'PROCESSING',
      });
      Logger.debug('IMAGE 2');
      await Promise.all(
        res.data.data.map(async (e, index) => {
          const imgRes = await axios.get(e.url, {
            responseType: 'arraybuffer',
            httpsAgent: this.agent,
          });
          const buffer = Buffer.from(imgRes.data);
          const uuidName = uuidv4();
          const ext = 'jpg';
          const objectName = `${uuidv4()}/${uuidName}.${ext}`;
          Logger.debug(buffer.length);
          await this.minioClientSerives.uploadFile(
            buffer,
            buffer.length,
            this.minioconfig.minioBucket,
            objectName,
          );
          Logger.debug('IMAGE 3');
          if (index === 0) {
            await this.updateAndEmit(
              user.userId,
              gallery.projectId,
              gallery.id,
              'SUCCESS',
              objectName,
            );
          } else {
            await this.galleryRepo.create({
              data: {
                taskId: gallery.taskId,
                projectId: gallery.projectId,
                userId: gallery.userId,
                prompt: gallery.prompt,
                imageUrl: objectName,
                typeGenerate: 'image',
                genneratedStatus: 'SUCCESS',
                status: false,
              },
            });
            // Also emit for extra images?
            // The frontend handles array of images if fetched.
            // But if we want real-time appearance of *all* images, we might need to emit for each?
            // Current updateAndEmit only updates the *primary* gallery item.
            // Let's assume the primary emit is enough for now or we emit general update.
          }
        }),
      );

      await this.logrepo.create({
        data: {
          taskId: uuidv4(),
          projectId: dto.projectId,
          userId: user.userId,
          prompt: dto.text,
          typeGenerate: dto.type,
          status: 'success',
          tokenUsed: res.data.usage?.total_tokens || 0,
          ImageUsed: res.data.usage?.generated_images || 0,
          referenceImages: dto.image.map((img) => img.fileName) || [],
        },
      });
    } else {
      throw new Error('No Data in response');
    }
  }

  // --- Cron Job for Polling ---
  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleCron() {
    if (!this.hasPendingTasks) {
      return;
    }

    const tasks = await this.galleryRepo.findMany({
      where: {
        genneratedStatus: 'PROCESSING',
        taskId: { not: null },
        typeGenerate: 'vdo',
      },
    });

    if (tasks.length === 0) {
      this.hasPendingTasks = false;
      return;
    }

    Logger.debug('LOOP');
    Logger.debug(tasks);
    for (const task of tasks) {
      await this.checkTaskStatus(task);
    }
  }

  async checkTaskStatus(task) {
    try {
      const getConfigApi = await this.masterdataconfigapiRepo.findOne({
        where: { id: 1 },
      });
      const url = `${getConfigApi.apiCreateTaskVdo}/${task.taskId}`;
      const token = getConfigApi.authorization;
      const authHeader = token.startsWith('Bearer ')
        ? token
        : `Bearer ${token}`;

      const res = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        httpsAgent: this.agent,
      });
      Logger.debug(res.data);
      if (res.data.status === 'succeeded' && res.data.content?.video_url) {
        Logger.debug(res.data);
        const videoUrl = res.data.content.video_url;
        const videoRes = await axios.get(videoUrl, {
          responseType: 'arraybuffer',
          httpsAgent: this.agent,
        });
        const buffer = Buffer.from(videoRes.data);
        const uuidName = uuidv4();
        const ext = 'mp4';

        const mockFile: Express.Multer.File = {
          fieldname: 'file',
          originalname: `${uuidName}.${ext}`,
          encoding: '7bit',
          mimetype: 'video/mp4',
          buffer: buffer,
          size: buffer.length,
          stream: null,
          destination: '',
          filename: '',
          path: '',
        };

        const result = await this.minioClientSerives.uploadVideoWithThumbnail(
          this.minioconfig.minioBucketVdo,
          mockFile,
          task.taskId,
        );

        await this.updateAndEmit(
          task.userId,
          task.projectId,
          task.id,
          'SUCCESS',
          result.file,
          result.thumbnail,
        );

        // Update Log status
        const log = await this.logrepo.findOne({
          where: { taskId: task.taskId },
        });
        if (log) {
          await this.logrepo.update({
            where: { id: log.id },
            data: { status: 'success' },
          });
        }
      } else if (res.data.status === 'failed') {
        await this.updateAndEmit(task.userId, task.projectId, task.id, 'FAIL');

        // Update Log status
        const log = await this.logrepo.findOne({
          where: { taskId: task.taskId },
        });
        if (log) {
          await this.logrepo.update({
            where: { id: log.id },
            data: { status: 'failed' },
          });
        }
      }
    } catch (e) {
      this.logger.error(`Polling error for task ${task.taskId}: ${e.message}`);
      if (e.response && e.response.status === 404) {
        await this.updateAndEmit(task.userId, task.projectId, task.id, 'FAIL');
      }
    }
  }

  private async updateAndEmit(
    userId: string,
    projectId: string,
    id: string,
    status: string,
    url?: string,
    thumbnail?: string,
  ) {
    await this.galleryRepo.update({
      where: { id },
      data: {
        genneratedStatus: status,
        imageUrl: url,
        thumbnailUrl: thumbnail,
      },
    });
    this.eventEmitter.emit(`image.update.project.${projectId}`, {
      galleryId: id,
      status,
      url,
    });
  }

  findAll(query: any, skip: number, take: number) {
    return `This action returns all GenerateImage`;
  }
  async findOne(id: string) {
    return `Action findOne`;
  }
  findOneNew(id: string) {
    return `Action findOneNew`;
  }
  update(id: number, updateGenerateImageDto: UpdateGenerateImageDto) {
    return `Update`;
  }
  remove(id: number) {
    return `Remove`;
  }
  async upload(data) {
    return data;
  }
}
