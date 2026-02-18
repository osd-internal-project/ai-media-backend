import { Prisma } from '@prisma/client';
import {
  GenerateImageRepository,
  MasterdataModelTypeRepository,
  LogRepository,
  GalleryRepository,
  MasterDataConfigApiRepository,
  UsersRepository,
  OrganizationMemberRepository,
  ErrorLogRepository,
  AuditLogRepository,
  ProjectMemberRepository,
  TosService,
} from '@ai-media/share';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import axios from 'axios';
import * as https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { ConfigType } from '@nestjs/config';
import { tosConfigs } from 'src/configs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Log } from 'src/logs/entities/log.entity';
import * as path from 'path';
import * as fs from 'fs';
import * as ffmpeg from 'fluent-ffmpeg';
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);
@Injectable()
export class GenerateImageService implements OnModuleInit {
  private readonly logger = new Logger(GenerateImageService.name);
  private readonly agent = new https.Agent({ rejectUnauthorized: false });
  private hasPendingTasks = false;

  constructor(
    private readonly generateimagerepo: GenerateImageRepository,
    private readonly logrepo: LogRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly modeltypeRepo: MasterdataModelTypeRepository,
    private readonly masterdataconfigapiRepo: MasterDataConfigApiRepository,
    private readonly projectMemberRepository: ProjectMemberRepository,

    private readonly userRepo: UsersRepository,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private eventEmitter: EventEmitter2,
    private readonly errorLogRepo: ErrorLogRepository,
    private readonly auditLogRepo: AuditLogRepository,
    private readonly tosService: TosService,
  ) {}

  async onModuleInit() {
    // Check if there are any pending tasks on startup to set the flag correctly
    const pendingTasks = await this.galleryRepo.findMany({
      where: {
        genneratedStatus: 'PROCESSING',
        taskId: { not: null },
        typeGenerate: 'video',
      },
      take: 1,
    });
    this.hasPendingTasks = pendingTasks.length > 0;
    if (this.hasPendingTasks) {
      this.logger.log('Restored pending VDO tasks monitoring.');
    }
  }

  async create(createGenerateImageDto: CreateGenerateImageDto) {
    const uuid = uuidv4();

    const getConfigApi = await this.masterdataconfigapiRepo.findOne({
      where: { id: 1 },
    } as Prisma.MasterDataConfigApiFindFirstArgs);

    const user = await this.userRepo.findOne({
      where: { token: createGenerateImageDto.userId },
    });
    if (user) {
      await this.logAudit(user.userId, 'CREATE', createGenerateImageDto, uuid);
    }
    // 1. Validate Quota
    const projectMember = await this.projectMemberRepository.findOne({
      where: {
        projectId: createGenerateImageDto.projectId,
        userId: user.userId,
      },
    });
    if (!projectMember) {
      Logger.error(`Team member not found`);
      return { status: 400, data: 'Token token limit exceeded' };
    }
    if (createGenerateImageDto.type === 'video') {
      const totalVDOGenerate = await this.logrepo.findMany({
        where: {
          userId: user.userId,
          typeGenerate: createGenerateImageDto.type,
          projectId: createGenerateImageDto.projectId,
          status: 'success',
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            lt: new Date(
              new Date().getFullYear(),
              new Date().getMonth() + 1,
              1,
            ),
          },
        },
      });
      const totalTokenUsed = totalVDOGenerate.reduce(
        (sum, item) => sum + item.tokenUsed,
        0,
      );

      if (totalTokenUsed > (projectMember?.maxToken || 0)) {
        Logger.error(
          `Token used ${totalTokenUsed} exceed max token ${projectMember?.maxToken}`,
        );
        return { status: 400, data: 'Token token limit exceeded' };
      }
    } else {
      const totalImageGenerate = await this.logrepo.findMany({
        where: {
          userId: user.userId,
          typeGenerate: createGenerateImageDto.type,
          projectId: createGenerateImageDto.projectId,
          status: 'success',
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            lt: new Date(
              new Date().getFullYear(),
              new Date().getMonth() + 1,
              1,
            ),
          },
        },
      });
      const totalImageUsed = totalImageGenerate.reduce(
        (sum, item) => sum + item.ImageUsed,
        0,
      );
      if (
        totalImageUsed + Number(createGenerateImageDto.images) >
        projectMember.maxImages
      ) {
        Logger.error(
          `Token used ${totalImageUsed} exceed max token ${projectMember?.maxImages}`,
        );
        return { status: 400, data: 'Image limit exceeded' };
      }
    }

    // 2. Create Gallery PENDING & Emit
    const galleryItem = await this.galleryRepo.create({
      data: {
        taskId: createGenerateImageDto.type === 'image' ? uuid : null,
        projectId: createGenerateImageDto.projectId,
        userId: user.userId,
        prompt: createGenerateImageDto.text,
        typeGenerate: createGenerateImageDto.type,
        genneratedStatus: 'PENDING',
        imageUrl: '',
        status: false,
        generateConfig: {
          ...(createGenerateImageDto?.width && {
            width: createGenerateImageDto?.width,
          }),
          ...(createGenerateImageDto?.height && {
            height: createGenerateImageDto?.height,
          }),
          ...(createGenerateImageDto?.ratio && {
            ratio: createGenerateImageDto?.ratio,
          }),
          ...(createGenerateImageDto?.images && {
            imageCount: createGenerateImageDto?.images,
          }),
          ...(createGenerateImageDto?.resolution && {
            resolution: createGenerateImageDto?.resolution,
          }),
          ...(createGenerateImageDto?.modelName && {
            modelName: createGenerateImageDto?.modelName,
          }),

          ...(createGenerateImageDto?.duration && {
            duration: createGenerateImageDto?.duration,
          }),
          content: createGenerateImageDto?.text,
          ...(createGenerateImageDto?.generateAudio && {
            generateAudio: createGenerateImageDto?.generateAudio,
          }),
        },
      },
    });
    Logger.debug('GENERETE PENDING TASK', galleryItem.id);
    this.eventEmitter.emit(
      `image.update.project.${createGenerateImageDto.projectId}`,
      {
        galleryId: galleryItem.id,
        status: 'PENDING',
        type: createGenerateImageDto.type,
      },
    );

    // 3. Prepare Request
    const axiosConfig = {
      headers: {
        'Content-Type': `${getConfigApi.configType}`,
        Authorization: `${getConfigApi.authorization}`,
      },
      httpsAgent: this.agent,
    };

    const getModelType = await this.getModelType(createGenerateImageDto);
    if (!getModelType) {
      await this.updateAndEmit(
        user.userId,
        galleryItem.projectId,
        galleryItem.id,
        'FAILED',
      );
      return { status: 400, data: 'Model not found' };
    }

    // 4. Send Request (Async execution to avoid blocking if needed, but here we wait for initial response)
    try {
      if (createGenerateImageDto.type === 'video') {
        Logger.debug('SEND GENERATE VIDEO :', galleryItem.id);
        const taskId = await this.handleVdoRequest(
          createGenerateImageDto,
          getModelType,
          getConfigApi,
          axiosConfig,
          user,
          galleryItem,
          createGenerateImageDto.organizationId,
        );
        if (taskId) {
          galleryItem.taskId = taskId;
        }
      } else {
        Logger.debug('SEND GENERATE IMAGE :', galleryItem.id);
        Logger.debug('Detail :', galleryItem);
        await this.handleImageRequest(
          uuid,
          createGenerateImageDto,
          getModelType,
          getConfigApi,
          axiosConfig,
          user,
          galleryItem,
        );
      }
    } catch (error) {
      this.logger.error(error);
      await this.updateAndEmit(
        user.userId,
        galleryItem.projectId,
        galleryItem.id,
        'FAILED',
      );
      // We do not return error status here because we want the frontend to know the task started (optimistic) and failed later via SSE
      // BUT the initial API return is also important.
      return { status: 500, data: 'Generation failed' };
    }

    return { status: 200, data: galleryItem };
  }

  // --- Handlers ---

  private async getModelType(dto: CreateGenerateImageDto) {
    console.log(dto);
    const description =
      dto.type === 'video'
        ? dto.image
          ? 'image-to-video'
          : 'text-to-video'
        : dto.type === 'image'
        ? dto.image
          ? 'image-to-image'
          : 'text-to-image'
        : 'image-to-video';

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
    organizationId,
  ) {
    // Prepare Payload
    let imageContents: any[] = [];
    Logger.debug('dto.image', dto.image);
    if (dto.image && Array.isArray(dto.image)) {
      for (const img of dto.image) {
        const url = await this.tosService.getPreSignedUrl(
          tosConfigs().tosBucket,
          `organize/${organizationId}/${dto.projectId}/uploads/${img.fileName}`,
        );
        imageContents.push({
          type: 'image_url',
          image_url: { url },
          role: 'first_frame',
        });
      }
      if (dto.image.length >= 2) {
        const url1 = await this.tosService.getPreSignedUrl(
          tosConfigs().tosBucket,
          `organize/${organizationId}/${dto.projectId}/uploads/${dto.image[0].fileName}`,
        );
        const url2 = await this.tosService.getPreSignedUrl(
          tosConfigs().tosBucket,
          `organize/${organizationId}/${dto.projectId}/uploads/${dto.image[1].fileName}`,
        );
        imageContents = [
          { type: 'image_url', image_url: { url: url1 }, role: 'first_frame' },
          { type: 'image_url', image_url: { url: url2 }, role: 'last_frame' },
        ];
      } else if (dto.image.length === 1) {
        const url = await this.tosService.getPreSignedUrl(
          tosConfigs().tosBucket,
          `organize/${organizationId}/${dto.projectId}/uploads/${dto.image[0].fileName}`,
        );
        imageContents = [
          { type: 'image_url', image_url: { url }, role: 'first_frame' },
        ];
      }
    }
    Logger.debug('imageContents', imageContents);
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
    Logger.debug(base);
    try {
      const res = await axios.post(
        `${config.apiCreateTaskVdo}`,
        base,
        axiosConfig,
      );

      console.debug('sendvideo', res.data);
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
            generateAudio: dto.generateAudio,
            referenceImages: dto.image
              ? dto.image.map((img) => img.fileName)
              : [],
            resolution: dto.resolution || '2k',
            ratio: dto.ratio || '1:1',
            generateConfig: {
              ...(dto?.width && {
                width: dto?.width,
              }),
              ...(dto?.height && {
                height: dto?.height,
              }),
              ...(dto?.ratio && {
                ratio: dto?.ratio,
              }),
              ...(dto?.images && {
                imageCount: dto?.images,
              }),
              ...(dto?.resolution && {
                resolution: dto?.resolution,
              }),
              ...(dto?.modelName && {
                modelName: dto?.modelName,
              }),

              ...(dto?.duration && {
                duration: dto?.duration,
              }),
              content: dto?.text,
              ...(dto?.generateAudio && {
                generateAudio: dto?.generateAudio,
              }),
            },
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
    } catch (error) {
      Logger.error(error);
      if (user) {
        await this.logError(user.userId, error.message, error.stack, dto);
      }
      if (
        error.response &&
        error.response.data &&
        error.response.data.message
      ) {
        console.log(
          user.userId,
          `${error.response.data.message}`,
          error.stack,
          dto,
        );
        this.logError(
          user.userId,
          `${error.response.data.message}`,
          error.stack,
          dto,
        );
      } else {
        console.log(user.userId, `${error.message}`, error.stack, dto);
        this.logError(user.userId, `${error.message}`, error.stack, dto);
      }
      throw error;
    }
  }

  private async handleImageRequest(
    taskId,
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
        dto.image.map(async (img) => {
          return await this.tosService.getPreSignedUrl(
            tosConfigs().tosBucket,
            `organize/${dto.organizationId}/${dto.projectId}/uploads/${img.fileName}`,
          );
        }),
      );
    }
    try {
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
          sequential_image_generation_options: {
            max_images: dto.images,
          },
        }),
        stream: config.stream,
        watermark: config.watermark,
      };
      Logger.debug('SEND IMAGE DETAIL :', base);
      const res = await axios.post(
        `${config.apiCreateImage}`,
        base,
        axiosConfig,
      );

      if (res.data && res.data.data) {
        await this.galleryRepo.update({
          where: { id: gallery.id },
          data: { genneratedStatus: 'PROCESSING' },
        });
        Logger.debug('API RESPONSIVE :', res.data ?? res.data.data);
        Logger.debug('UPDATE TASK PROCESSING :', gallery.id);

        this.eventEmitter.emit(`image.update.project.${gallery.projectId}`, {
          galleryId: gallery.id,
          status: 'PROCESSING',
        });
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
            await this.tosService.putObject(
              tosConfigs().tosBucket,
              `organize/${dto.organizationId}/${dto.projectId}/image-generate/${objectName}`,
              buffer,
            );

            if (index === 0) {
              await this.updateAndEmit(
                user.userId,
                gallery.projectId,
                gallery.id,
                'SUCCESS',
                objectName,
              );
              Logger.debug('UPDATE TASK SUCCESS ');
            } else {
              await this.galleryRepo.create({
                data: {
                  taskId: taskId,
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
            taskId: taskId,
            projectId: dto.projectId,
            userId: user.userId,
            prompt: dto.text,
            typeGenerate: dto.type,
            status: 'success',
            resolution: dto.resolution,
            ratio: dto.ratio,
            generateAudio: dto.generateAudio || false,
            tokenUsed: res.data.usage?.total_tokens || 0,
            ImageUsed: dto.images || 0,
            referenceImages: dto.image
              ? dto.image.map((img) => img.fileName)
              : [],
            generateConfig: {
              ...(dto?.width && {
                width: dto?.width,
              }),
              ...(dto?.height && {
                height: dto?.height,
              }),
              ...(dto?.ratio && {
                ratio: dto?.ratio,
              }),
              ...(dto?.images && {
                imageCount: dto?.images,
              }),
              ...(dto?.resolution && {
                resolution: dto?.resolution,
              }),
              ...(dto?.modelName && {
                modelName: dto?.modelName,
              }),

              ...(dto?.duration && {
                duration: dto?.duration,
              }),
              content: dto?.text,
            },
          },
        });
      } else {
        throw new Error('No Data in response');
      }
    } catch (error) {
      if (user) {
        await this.logError(user.userId, error.message, error.stack, dto);
      }
      throw error;
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
        typeGenerate: 'video',
      },
    });

    if (tasks.length === 0) {
      this.hasPendingTasks = false;
      return;
    }

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

        const result = await this.uploadVideoWithThumbnail(
          task.organizationId,
          task.projectId,
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
            data: {
              status: 'success',
              tokenUsed: res.data.usage?.total_tokens || 0,
            },
          });
        }
      } else if (res.data.status === 'failed') {
        await this.updateAndEmit(task.userId, task.projectId, task.id, 'FAILED');

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
      await this.logError(task.userId, e.message, e.stack, { taskId: task.id });
      this.logger.error(`Polling error for task ${task.taskId}: ${e.message}`);
      if (e.response && e.response.status === 404) {
        await this.updateAndEmit(task.userId, task.projectId, task.id, 'FAILED');
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

  async createFileLogs(data: {
    filePath: string;
    fileType: string;
    fileName: string;
  }) {
    return data;
  }

  private async logAudit(
    userId: string,
    action: string,
    details: any,
    entityId: string,
  ) {
    try {
      await this.auditLogRepo.create({
        data: {
          userId,
          action: 'CREATE',
          entityName: 'GenerateImage',
          entityId,
          newValues: details,
        } as any,
      });
    } catch (e) {
      Logger.error(`Failed to create audit log: ${e}`);
    }
  }

  private async logError(
    userId: string,
    message: string,
    stack: string,
    context?: any,
  ) {
    try {
      await this.errorLogRepo.create({
        data: {
          serviceName: 'GenerateImageService',
          severity: 'ERROR',
          message,
          stackTrace: stack,
          context: context,
          userId,
        } as any,
      });
    } catch (e) {
      Logger.error(`Failed to create error log: ${e}`);
    }
  }
  private async uploadVideoWithThumbnail(
    organizationId: string,
    projectId: string,
    file: Express.Multer.File,
    id: string,
  ) {
    const videoFileName = `${Date.now()}-${file.originalname}`;
    const thumbnailFileName = `thumb-${Date.now()}.png`;
    const objectName = `${id}/${videoFileName}`;
    const thumbnailObjectName = `${id}/${thumbnailFileName}`;

    // Use os.tmpdir() for better compatibility
    const os = require('os');
    const tempDir = os.tmpdir();
    const tempVideoPath = path.join(tempDir, videoFileName);
    const tempThumbPath = path.join(tempDir, thumbnailFileName);

    // 2. เขียนไฟล์วิดีโอลง Disk ชั่วคราวเพื่อให้ FFmpeg อ่าน
    fs.writeFileSync(tempVideoPath, file.buffer);

    try {
      // 3. สร้าง Thumbnail ด้วย FFmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(tempVideoPath)
          .screenshots({
            count: 1,
            folder: path.dirname(tempThumbPath),
            filename: path.basename(tempThumbPath),
            timemarks: ['20%'], // จับภาพที่ตำแหน่ง 20% ของวิดีโอ
            size: '320x?', // ปรับขนาด (กว้าง 320, สูง auto)
          })
          .on('end', resolve)
          .on('error', reject);
      });

      // 4. Upload Video ขึ้น MinIO (ใช้ putObject แทน fPutObject)

      await this.tosService.putObject(
        tosConfigs().tosBucket,
        `organize/${organizationId}/${projectId}/video-generate/${objectName}`,
        file.buffer,
      );

      // 5. Upload Thumbnail ขึ้น MinIO
      // อ่านไฟล์ thumbnail ขึ้นมาเป็น buffer ก่อน
      const thumbBuffer = fs.readFileSync(tempThumbPath);
      await this.tosService.putObject(
        tosConfigs().tosBucket,
        `organize/${organizationId}/${projectId}/video-generate/${thumbnailObjectName}`,
        thumbBuffer,
      );

      // 6. (Optional) สร้าง Presigned URL แบบ Public (ถ้า bucket เป็น public ไม่ต้องใช้ presigned ก็ได้ แต่ code เดิมใช้)
      // const videoUrl = await this.minioClient.presignedGetObject(bucket, objectName, 24 * 60 * 60);
      // const thumbUrl = await this.minioClient.presignedGetObject(bucket, thumbnailObjectName, 24 * 60 * 60);

      return {
        file: objectName,
        thumbnail: thumbnailObjectName,
      };
    } catch (error) {
      console.error('Error in uploadVideoWithThumbnail:', error);
      throw new BadRequestException('Error processing video: ' + error.message);
    } finally {
      // 7. Cleanup: ลบไฟล์ temp ทิ้งเสมอ
      try {
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
        if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
      } catch (cleanupError) {
        console.error('Error cleaning up temp files:', cleanupError);
      }
    }
  }
}
