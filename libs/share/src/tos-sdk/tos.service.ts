import { createHmac } from 'crypto';
import { TosClient } from '@volcengine/tos-sdk';
import { Injectable } from '@nestjs/common';
import { handleError } from './handleError';

/** Cache-Control สำหรับ object ที่ key ไม่ซ้ำ (uuid/timestamp) — เนื้อไฟล์ไม่มีวันเปลี่ยน */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export interface PutObjectOptions {
  contentType?: string;
  cacheControl?: string;
}

export interface PostPolicyInput {
  /** ทุก key ที่อัปด้วย policy นี้ต้องขึ้นต้นด้วย prefix นี้ */
  keyPrefix: string;
  /** เช่น `image/` — TOS ปฏิเสธไฟล์ที่ Content-Type ไม่ขึ้นต้นด้วยค่านี้ */
  contentTypePrefix: string;
  maxBytes: number;
  expiresSec: number;
  /** TOS เรียก URL นี้แบบ sync หลังเก็บไฟล์ แล้วส่ง response กลับให้ browser */
  callback?: { url: string; body: string; bodyType?: string };
}

export interface PostPolicy {
  /** URL ของ bucket สำหรับ form POST */
  url: string;
  /** form field ที่ต้องแนบทุกครั้ง (ไม่รวม key / Content-Type / file) */
  fields: Record<string, string>;
  keyPrefix: string;
  expiresAt: string;
}

/** อ่านค่าตัวเลขจาก env — ไม่ได้ตั้งหรือไม่ใช่ตัวเลขให้คืน undefined เพื่อใช้ default ของ SDK */
function optionalNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function buildPresignQuery(options?: {
  process?: string;
  cacheControl?: string;
}): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  if (options?.process) query['x-tos-process'] = options.process;
  if (options?.cacheControl) {
    query['response-cache-control'] = options.cacheControl;
  }
  return Object.keys(query).length ? query : undefined;
}

/** รวม chunk ของ stream ครั้งเดียว — concat ทุกรอบเป็น O(n²) */
async function readAll(content: AsyncIterable<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of content) chunks.push(chunk);
  return Buffer.concat(chunks);
}

@Injectable()
export class TosService {
  private client: TosClient;
  private bucket = process.env.TOS_BUCKET!;

  constructor() {
    this.client = new TosClient({
      accessKeyId: process.env.TOS_ACCESS_KEY!,
      accessKeySecret: process.env.TOS_SECRET_KEY!,
      region: process.env.TOS_REGION!,
      endpoint: process.env.TOS_ENDPOINT!,
      maxConnections: optionalNumberEnv('TOS_MAX_CONNECTIONS'),
      connectionTimeout: optionalNumberEnv('TOS_CONNECTION_TIMEOUT_MS'),
      requestTimeout: optionalNumberEnv('TOS_REQUEST_TIMEOUT_MS'),
      maxRetryCount: optionalNumberEnv('TOS_MAX_RETRY_COUNT'),
    });
  }

  async createBucket(bucket: string) {
    try {
      await this.client.createBucket({
        bucket: bucket,
      });
      const { data } = await this.client.listBuckets();

      const theBucket = data.Buckets.find((it) => it.Name === bucket);
      return theBucket;
    } catch (error) {
      handleError(error);
    }
  }

  async deleteBucket(bucketName: string) {
    try {
      const { data } = await this.client.deleteBucket(bucketName);
      return data;
    } catch (error) {
      handleError(error);
    }
  }

  async getBucketLocation(bucketName: string) {
    try {
      const { data } = await this.client.getBucketLocation({
        bucket: bucketName,
      });
      return data;
    } catch (error) {
      handleError(error);
    }
  }

  async putObject(
    bucketName: string,
    objectName: string,
    body: Buffer,
    options?: PutObjectOptions,
  ) {
    try {
      const { data } = await this.client.putObject({
        bucket: bucketName,
        key: objectName,
        body: body,
        contentType: options?.contentType,
        cacheControl: options?.cacheControl,
      });
      return data;
    } catch (error) {
      handleError(error);
    }
  }

  /**
   * Ask TOS to fetch an object directly from a remote URL (server-side). The
   * bytes flow source→TOS and never transit this pod — used to store
   * provider-generated videos without downloading + re-uploading them.
   * @param url Publicly fetchable source URL (must be reachable by TOS).
   * @throws ส่งต่อ error หลัง log ให้ผู้เรียก fail งาน
   */
  async fetchObject(bucketName: string, objectName: string, url: string) {
    try {
      const { data } = await this.client.fetchObject({
        bucket: bucketName,
        key: objectName,
        url,
      });
      return data;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }

  /**
   * Create a poster thumbnail from an already-stored video via TOS server-side
   * data processing (`video/snapshot`) and persist the small image. Only the
   * tiny snapshot bytes pass through this pod, never the full video.
   * @param atMs Snapshot position in milliseconds into the video.
   * @param width Output width in px (height keeps the aspect ratio).
   * @returns The thumbnail object key.
   * @throws ส่งต่อ error หลัง log ให้ผู้เรียก fail งาน
   */
  async createVideoThumbnail(
    bucketName: string,
    videoObjectName: string,
    thumbObjectName: string,
    atMs = 2000,
    format: 'jpg' | 'png' = 'jpg',
    width = 320,
  ) {
    try {
      const process = `video/snapshot,t_${Math.max(
        0,
        Math.floor(atMs),
      )},f_${format},w_${width}`;
      const {
        data: { content },
      } = await this.client.getObjectV2({
        bucket: bucketName,
        key: videoObjectName,
        process,
      });
      // getObjectV2 ใน Node คืน Readable ซึ่งเป็น AsyncIterable<Buffer>
      const snapshot = await readAll(content as AsyncIterable<Buffer>);
      await this.client.putObject({
        bucket: bucketName,
        key: thumbObjectName,
        body: snapshot,
        contentType: format === 'png' ? 'image/png' : 'image/jpeg',
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      });
      return thumbObjectName;
    } catch (error) {
      handleError(error);
      throw error;
    }
  }

  async uploadCallback(bucketName: string, objectName: string, body: Buffer) {
    const callbackUrl = '*** Provide your callback url ***';
    const objectKey = '*** Provide your object key ***';
    try {
      const callback = `
                    {
                    "callbackUrl" : "${callbackUrl}", 
                    "callbackBody" : ${'"{\\"bucket\\": ${bucket}, \\"object\\": ${object}, \\"key1\\": ${x:key1}}"'}, 
                    "callbackBodyType" : "application/json"                
                    }`;
      const callbackVar = `
                    {
                    "x:key1" : "ceshi"
                    }`;
      const { requestId: putObjectRequestId } = await this.client.putObject({
        bucket: bucketName,
        key: objectKey,
        body: body,
        callback: Buffer.from(callback).toString('base64'),
        callbackVar: Buffer.from(callbackVar).toString('base64'),
      });
      return putObjectRequestId;
    } catch (error) {
      handleError(error);
    }
  }

  async getObjectV2(bucketName: string, objectName: string) {
    try {
      const {
        data: { content },
      } = await this.client.getObjectV2({
        bucket: bucketName,
        key: objectName,
      });
      // getObjectV2 ใน Node คืน Readable ซึ่งเป็น AsyncIterable<Buffer>
      return await readAll(content as AsyncIterable<Buffer>);
    } catch (error) {
      handleError(error);
    }
  }

  async getObjectToFile(
    bucketName: string,
    imageKey: string,
    style: string,
    fileName: string,
  ) {
    try {
      const { requestId, headers } = await this.client.getObjectToFile({
        bucket: bucketName,
        key: imageKey,
        process: style,
        filePath: fileName,
      });
      return { requestId, headers };
    } catch (error) {
      handleError(error);
    }
  }

  async getPreSignedUrl(
    bucketName: string,
    objectName: string,
    options?: {
      contentType?: string;
      contentDisposition?: string;
      expires?: number;
      /** TOS image processing เช่น `image/resize,w_480` — ต้องเปิด IMP บน bucket */
      process?: string;
      /** override header `Cache-Control` ของ response ผ่าน `response-cache-control` */
      cacheControl?: string;
    },
  ) {
    try {
      const url = this.client.getPreSignedUrl({
        method: 'GET',
        bucket: bucketName,
        key: objectName,
        expires: options?.expires,
        query: buildPresignQuery(options),
        // Let the presigned URL carry download semantics (forces the browser to
        // save with the right name/type) so the file streams straight from TOS.
        response:
          options?.contentType || options?.contentDisposition
            ? {
                contentType: options?.contentType,
                contentDisposition: options?.contentDisposition,
              }
            : undefined,
      });
      // console.log('PreSignedUrl:', url);
      return url;
    } catch (error) {
      // ต่างจาก method อื่นในคลาสนี้: log แล้ว rethrow เพราะการกลืน error ทำให้ได้
      // `url: undefined` หลุดไปถึง provider payload โดยไม่มีใครรู้
      // ผู้ตัดสินใจว่าจะ soft/hard fail คือ StorageUrlService ไม่ใช่ที่นี่
      handleError(error);
      throw error;
    }
  }

  /**
   * POST policy สำหรับ browser form upload ใช้ซ้ำได้หลายไฟล์ภายใน `keyPrefix`
   * sign แบบ TOS4 เหมือน SDK `calculatePostSignature` แต่ไม่ล็อก key ตรงตัว (SDK บังคับ eq key)
   */
  createPostPolicy(input: PostPolicyInput): PostPolicy {
    const accessKeyId = process.env.TOS_ACCESS_KEY!;
    const secret = process.env.TOS_SECRET_KEY!;
    const region = process.env.TOS_REGION!;
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const date8 = dateStr.slice(0, 8);
    const credential = [accessKeyId, date8, region, 'tos', 'request'].join('/');
    const expiresAt = new Date(now.valueOf() + input.expiresSec * 1000).toISOString();

    const fields: Record<string, string> = {
      'x-tos-algorithm': 'TOS4-HMAC-SHA256',
      'x-tos-date': dateStr,
      'x-tos-credential': credential,
    };
    const conditions: unknown[] = [
      { bucket: this.bucket },
      ['starts-with', '$key', input.keyPrefix],
      ['content-length-range', 1, input.maxBytes],
      ['starts-with', '$Content-Type', input.contentTypePrefix],
    ];
    if (input.callback) {
      fields['x-tos-callback'] = Buffer.from(
        JSON.stringify({
          callbackUrl: input.callback.url,
          callbackBody: input.callback.body,
          callbackBodyType: input.callback.bodyType ?? 'application/json',
        }),
      ).toString('base64');
      // ค่าต่อไฟล์ (uid, ชื่อ ฯลฯ) browser ใส่เองผ่าน x-tos-callback-var
      conditions.push(['starts-with', '$x-tos-callback-var', '']);
    }
    for (const [name, value] of Object.entries(fields)) {
      conditions.push({ [name]: value });
    }

    const policy = Buffer.from(
      JSON.stringify({ expiration: expiresAt, conditions }),
    ).toString('base64');
    const hmac = (key: string | Buffer, data: string) =>
      createHmac('sha256', key).update(data).digest();
    const signingKey = hmac(
      hmac(hmac(hmac(secret, date8), region), 'tos'),
      'request',
    );
    fields.policy = policy;
    fields['x-tos-signature'] = createHmac('sha256', signingKey)
      .update(policy)
      .digest('hex');

    return {
      url: `https://${this.bucket}.${process.env.TOS_ENDPOINT}`,
      fields,
      keyPrefix: input.keyPrefix,
      expiresAt,
    };
  }

  /**
   * Presigned PUT URL ให้ browser อัปโหลดตรงเข้า TOS โดยไม่ผ่าน pod
   * signature ไม่ผูก Content-Type/ขนาดไฟล์ — ผู้เรียกต้องตรวจด้วย headObject หลังอัปโหลด
   */
  getPreSignedPutUrl(
    bucketName: string,
    objectName: string,
    expires?: number,
  ): string {
    try {
      return this.client.getPreSignedUrl({
        method: 'PUT',
        bucket: bucketName,
        key: objectName,
        expires,
      });
    } catch (error) {
      handleError(error);
      throw error;
    }
  }

  async copyObject(
    bucketName: string,
    sourceObjectName: string,
    targetObjectName: string,
  ) {
    try {
      const { data } = await this.client.copyObject({
        bucket: bucketName,
        key: targetObjectName,
        srcBucket: bucketName,
        srcKey: sourceObjectName,
      });
      return data;
    } catch (error) {
      handleError(error);
    }
  }

  async deleteObject(bucketName: string, objectName: string) {
    try {
      const { data } = await this.client.deleteObject({
        bucket: bucketName,
        key: objectName,
      });
      return data;
    } catch (error) {
      handleError(error);
    }
  }

  async headObject(bucketName: string, objectName: string) {
    try {
      const { data } = await this.client.headObject({
        bucket: bucketName,
        key: objectName,
      });
      return data;
    } catch (error) {
      handleError(error);
    }
  }
}
