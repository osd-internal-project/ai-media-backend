import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreateOmnihumanDto } from './dto/create-omnihuman.dto';
import { UpdateOmnihumanDto } from './dto/update-omnihuman.dto';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { GenerateImageService } from 'src/generate-image/generate-image.service';
import configs from 'src/configs';
const config = configs();
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestHeaders } from 'axios';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';
import {
  LogRepository,
  OmnihumenTaskRepository,
  UsersRepository,
} from '@ai-media/share';

@Injectable()
export class OmnihumenService {
  private readonly accessKeyId =
    process.env.BYTEPLUS_ACCESS_KEY ||
    'AKAPYzE5OGNhNmRkZDVlNDllYzlhM2MwNTU3MTE0YWM4ZGM';

  private readonly secretAccessKey =
    process.env.BYTEPLUS_SECRET_KEY ||
    'T1RnM09HSTJNVFEwWmpBek5EY3lNMkZqWmpabE5tWm1aR0ZrT0dabU9UVQ==';

  private readonly region = 'ap-singapore-1';
  private readonly service = 'cv';
  private readonly host = 'cv.byteplusapi.com';
  private readonly contentType = 'application/json';

  constructor(
    private readonly generateImageService: GenerateImageService,
    private readonly minioclientSerives: MinioClientService,
    private readonly httpService: HttpService,
    private readonly logrepo: LogRepository,
    private readonly omnihumenTaskRepository: OmnihumenTaskRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async create(
    createOmnihumanDto: CreateOmnihumanDto,
    files: { image?: Express.Multer.File[]; audio?: Express.Multer.File[] },
  ) {
    const baseUrl = configs().pathDomain;
    if (files?.audio && files?.image) {
      const bucketname = config.minioBucketUpload;
      const audioExt = path.extname(files.audio[0].originalname); // นามสกุลไฟล์
      const audioFileName = `${uuidv4()}${audioExt}`;
      const audio = await this.minioclientSerives
        .uploadFile(
          files.audio[0].buffer,
          files.audio[0].buffer.length,
          bucketname,
          audioFileName,
        )
        .then(() => {
          const data = {
            filePath: `${bucketname}/${audioFileName}`,
            fileType: files.audio[0].mimetype,
            fileName: audioFileName,
          };
          return this.generateImageService.createFileLogs(data);
        });
      const imageExt = path.extname(files.image[0].originalname); // นามสกุลไฟล์
      const imageFileName = `${uuidv4()}${imageExt}`;
      const image = await this.minioclientSerives
        .uploadFile(
          files.image[0].buffer,
          files.image[0].buffer.length,
          bucketname,
          imageFileName,
        )
        .then(() => {
          const data = {
            filePath: `${bucketname}/${imageFileName}`,
            fileType: files.image[0].mimetype,
            fileName: imageFileName,
          };
          return this.generateImageService.createFileLogs(data);
        });
      Logger.debug(`audio, image`);
      Logger.debug(audio, image);
      const generateTask = await this.submitTask({
        req_key: 'realman_avatar_picture_omni15_cv',
        image_url:
          'https://sf16-resources.bytepluscdn.com/obj/byteplus-public-aiso/cloud-universal-doc/upload_acb84d04326453695183a54a07af5e05.png',
        audio_url:
          'https://econnect2025-dcall.osd.co.th/voicefile/voicefile/2025/09/29/out-9020801111-4006-20250929-095752-1759114672.1.mp3',
        prompt: createOmnihumanDto.prompt || '',
      });
      if (generateTask?.data?.task_id) {
        // Logger.debug(createOmnihumanDto);
        // await this.logrepo.create({
        //   data: {
        //     taskId: generateTask.data.task_id,
        //     projectId: createOmnihumanDto.projectId,
        //     userId: createOmnihumanDto.userId,
        //     prompt: `${createOmnihumanDto.prompt} `,
        //     typeGenerate: 'omnihumen',
        //     status: 'pending',
        //     tokenUsed: 0,
        //     ImageUsed: 0,
        //   },
        // });
        Logger.debug('generateTask');
        Logger.debug(generateTask);
        const task = await this.omnihumenTaskRepository.create({
          data: {
            taskId: generateTask.data.task_id,
            projectId: createOmnihumanDto.projectId,
            userId: createOmnihumanDto.userId,
            prompt: `${createOmnihumanDto.prompt} `,
            status: false,
            avatarName: createOmnihumanDto.avatarName,
            taskMessage: generateTask?.message,
          },
        });
        return task;
      }
      return generateTask;
    } else {
      throw new BadRequestException('No Image or Audio');
    }
  }

  findAll() {
    return `This action returns all omnihumen`;
  }

  findOne(id: number) {
    return `This action returns a #${id} omnihuman`;
  }

  update(id: number, updateOmnihumanDto: UpdateOmnihumanDto) {
    return `This action updates a #${id} omnihuman`;
  }

  remove(id: number) {
    return `This action removes a #${id} omnihuman`;
  }

  async submitTask(payload: any) {
    const method = 'POST';
    const uri = '/';
    const query = 'Action=CVSubmitTask&Version=2024-06-06';
    const body = JSON.stringify(payload);

    /** ---------- Date ---------- */
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');

    const xDate =
      now.getUTCFullYear().toString() +
      pad(now.getUTCMonth() + 1) +
      pad(now.getUTCDate()) +
      'T' +
      pad(now.getUTCHours()) +
      pad(now.getUTCMinutes()) +
      pad(now.getUTCSeconds()) +
      'Z';

    const shortDate = xDate.slice(0, 8);

    /** ---------- Hash Body ---------- */
    const xContentSha256 = crypto
      .createHash('sha256')
      .update(body)
      .digest('hex');

    /** ---------- Canonical ---------- */
    const signedHeaders = 'content-type;host;x-content-sha256;x-date';

    const canonicalHeaders =
      `content-type:${this.contentType}\n` +
      `host:${this.host}\n` +
      `x-content-sha256:${xContentSha256}\n` +
      `x-date:${xDate}\n`;

    const canonicalRequest = [
      method,
      uri,
      query,
      canonicalHeaders,
      signedHeaders,
      xContentSha256,
    ].join('\n');

    /** ---------- String to Sign ---------- */
    const credentialScope = `${shortDate}/${this.region}/${this.service}/request`;

    const stringToSign = [
      'HMAC-SHA256',
      xDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    /** ---------- Signing Key ---------- */
    const hmac = (key: Buffer | string, msg: string) =>
      crypto.createHmac('sha256', key).update(msg).digest();

    const kDate = hmac(this.secretAccessKey, shortDate);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, this.service);
    const kSigning = hmac(kService, 'request');

    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign)
      .digest('hex');

    const authorization = `HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    /** ---------- Headers ---------- */
    const headers = {
      'Content-Type': this.contentType,
      Host: this.host,
      'X-Date': xDate,
      'X-Content-Sha256': xContentSha256,
      Authorization: authorization,
    };

    /** ---------- Call API ---------- */
    const url = `https://${this.host}/?${query}`;

    const res = await firstValueFrom(
      this.httpService.post(url, body, { headers }),
    );

    return res.data;
  }
}
