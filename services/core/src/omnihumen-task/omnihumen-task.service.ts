import { Injectable, Logger } from '@nestjs/common';
import { CreateOmnihumenTaskDto } from './dto/create-omnihumen-task.dto';
import { UpdateOmnihumenTaskDto } from './dto/update-omnihumen-task.dto';
import { GalleryRepository, OmnihumenTaskRepository } from '@ai-media/share';
import { HttpService } from '@nestjs/axios';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import configs from 'src/configs';
import axios from 'axios';
import * as https from 'https';
import { v4 as uuidv4 } from 'uuid';
import { MinioClientService } from 'src/minio-client/minio-client.service';
const config = configs();

@Injectable()
export class OmnihumenTaskService {
  private readonly logger = new Logger(OmnihumenTaskService.name);

  constructor(
    private readonly omnihumenTaskRepo: OmnihumenTaskRepository,
    private readonly httpService: HttpService,
    private readonly minioClientService: MinioClientService,
    private readonly galleryRepo: GalleryRepository,
  ) {}

  create(createOmnihumenTaskDto: CreateOmnihumenTaskDto) {
    return this.omnihumenTaskRepo.create({
      data: createOmnihumenTaskDto,
    });
  }

  findAll() {
    return this.omnihumenTaskRepo.findMany({});
  }

  findOne(id: number) {
    return this.omnihumenTaskRepo.findOne({ where: { id } });
  }

  findByProjectId(projectId: string) {
    return this.omnihumenTaskRepo.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: number, updateOmnihumenTaskDto: UpdateOmnihumenTaskDto) {
    return this.omnihumenTaskRepo.update({
      where: { id },
      data: updateOmnihumenTaskDto,
    });
  }

  remove(id: number) {
    return this.omnihumenTaskRepo.delete({ where: { id } });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    const tasks = await this.omnihumenTaskRepo.findMany({
      where: { status: false },
    });

    if (tasks.length > 0) {
      this.logger.debug(`Checking status for ${tasks.length} pending tasks`);
      for (const task of tasks) {
        if (task.taskId) {
          const checkTaskStatus = await this.checkTaskStatus(
            task.id,
            task.taskId,
          );
          console.log(checkTaskStatus);
        }
      }
    }
  }

  async checkTaskStatus(id: number, taskId: string) {
    try {
      const agent = new https.Agent({
        rejectUnauthorized: false,
      });
      const accessKeyId = config.byteplusAccessKeyId;
      const secretAccessKey = config.byteplusSecretKey;
      const region = 'ap-singapore-1';
      const service = 'cv';
      const host = 'cv.byteplusapi.com';
      const path = '/?Action=CVGetResult&Version=2024-06-06';
      const method = 'POST';
      const contentType = 'application/json';

      const body = JSON.stringify({
        req_key: 'realman_avatar_picture_omni15_cv',
        task_id: taskId,
      });

      // Dates
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const dateStamp = amzDate.slice(0, 8);

      // 1. Authorization Header
      const canonicalUri = '/';
      const canonicalQueryString = 'Action=CVGetResult&Version=2024-06-06';
      const canonicalHeaders =
        `content-type:${contentType}\n` +
        `host:${host}\n` +
        `x-content-sha256:${this.sha256Hex(body)}\n` +
        `x-date:${amzDate}\n`;
      const signedHeaders = 'content-type;host;x-content-sha256;x-date';
      const payloadHash = this.sha256Hex(body);
      const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

      const algorithm = 'HMAC-SHA256';
      const credentialScope = `${dateStamp}/${region}/${service}/request`;
      const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${this.sha256Hex(
        canonicalRequest,
      )}`;

      const signingKey = this.getSignatureKey(
        secretAccessKey,
        dateStamp,
        region,
        service,
      );
      const signature = this.hmacSHA256Hex(signingKey, stringToSign);

      const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const headers = {
        'Content-Type': contentType,
        Host: host,
        'X-Content-Sha256': payloadHash,
        'X-Date': amzDate,
        Authorization: authorization,
      };

      const url = `https://${host}${path}`;
      Logger.debug('url,', url);
      const response = await firstValueFrom(
        this.httpService.post(url, body, { headers, httpsAgent: agent }),
      );

      // const response = await axios.post(url, body, {
      //   headers,
      //   httpsAgent: agent,
      // });
      const data = response.data;
      Logger.debug(data);
      if (data?.code === 10000 && data?.data?.resp_data) {
        // Assuming success status means it's done
        // Need to map response to task updates
        // Example response structure needs to be handled
        // For now, I'll update status to true if success
        // And save the result if needed.
        // Specifically getting video url from data.resp_data if available

        const fileOrgPath = JSON.parse(data.data.resp_data);
        Logger.debug('fileOrgPath', fileOrgPath);

        let objectName = fileOrgPath?.video_url;

        try {
          if (!fileOrgPath?.video_url) {
            return;
          }
          const getFile = await axios.get(fileOrgPath?.video_url, {
            responseType: 'arraybuffer',
            httpsAgent: agent,
          });
          const buffer = Buffer.from(getFile.data);
          const uuidName = uuidv4();
          const pathname = fileOrgPath?.video_url;

          let ext = 'mp4';
          try {
            const urlObj = new URL(pathname);
            const pathOnly = urlObj.pathname;
            const possibleExt = pathOnly.split('.').pop();
            if (possibleExt && possibleExt.length <= 5) {
              ext = possibleExt;
            }
          } catch (e) {}

          const newObjectName = `${taskId}/${uuidName}.${ext}`;
          console.log('objectName', newObjectName);
          await this.minioClientService.uploadFile(
            buffer,
            buffer.length,
            config.minioBucketVdo,
            newObjectName,
          );
          objectName = newObjectName;
        } catch (uploadError) {
          Logger.warn(
            `Failed to upload to MinIO, using original URL: ${uploadError.message}`,
          );
        }

        const task = await this.update(id, {
          status: true,
          taskMessage: 'Success',
          filePath: objectName, // Store result if unsure
          taskCode: data?.data?.code,
          fileOrgPath: fileOrgPath?.video_url,
        } as any);
        await this.galleryRepo.create({
          data: {
            taskId: taskId,
            projectId: task.projectId,
            userId: task.userId,
            imageUrl: objectName,
            prompt: task.prompt,
            typeGenerate: 'vdo',
          },
        });

        this.logger.log(`Task ${taskId} completed.`);
      } else if (data?.data?.status === 'failed') {
        await this.update(id, {
          status: true, // Mark as processed? Or handle failed state
          taskMessage: 'Failed ',
          taskCode: data?.data?.code,
        } as any);
      }
    } catch (error) {
      this.logger.error(
        `Error checking task ${taskId}`,
        error?.response?.data || error.message,
      );
      await this.update(id, {
        status: true, // Mark as processed? Or handle failed state
        taskMessage: 'Failed ',
        taskCode: String(error?.response?.data.code),
      } as any);
    }
  }

  private sha256Hex(data: string) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private hmacSHA256(key: string | Buffer, data: string) {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  private hmacSHA256Hex(key: string | Buffer, data: string) {
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  private getSignatureKey(
    key: string,
    dateStamp: string,
    regionName: string,
    serviceName: string,
  ) {
    const kDate = this.hmacSHA256(key, dateStamp);
    const kRegion = this.hmacSHA256(kDate, regionName);
    const kService = this.hmacSHA256(kRegion, serviceName);
    const kSigning = this.hmacSHA256(kService, 'request');
    return kSigning;
  }
}
