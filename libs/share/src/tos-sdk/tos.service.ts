import { TosClient } from '@volcengine/tos-sdk';
import { Injectable } from '@nestjs/common';
import { handleError } from './handleError';

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

  async putObject(bucketName: string, objectName: string, body: Buffer) {
    try {
      await this.client.putObject({
        bucket: bucketName,
        key: objectName,
        body: body,
      });

      const { data } = await this.client.headObject({
        bucket: bucketName,
        key: objectName,
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
    }
  }

  /**
   * Create a poster thumbnail from an already-stored video via TOS server-side
   * data processing (`video/snapshot`) and persist the small image. Only the
   * tiny snapshot bytes pass through this pod, never the full video.
   * @param atMs Snapshot position in milliseconds into the video.
   * @returns The thumbnail object key, or undefined on failure.
   */
  async createVideoThumbnail(
    bucketName: string,
    videoObjectName: string,
    thumbObjectName: string,
    atMs = 2000,
  ) {
    try {
      const process = `video/snapshot,t_${Math.max(
        0,
        Math.floor(atMs),
      )},f_jpg,w_320`;
      const {
        data: { content },
      } = await this.client.getObjectV2({
        bucket: bucketName,
        key: videoObjectName,
        process,
      });
      let snapshot = Buffer.from([]);
      for await (const chunk of content as any) {
        snapshot = Buffer.concat([snapshot, chunk]);
      }
      await this.client.putObject({
        bucket: bucketName,
        key: thumbObjectName,
        body: snapshot,
      });
      return thumbObjectName;
    } catch (error) {
      handleError(error);
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
      let allContent = Buffer.from([]);
      for await (const chunk of content as any) {
        allContent = Buffer.concat([allContent, chunk]);
      }
      return allContent;
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
    },
  ) {
    try {
      const url = this.client.getPreSignedUrl({
        method: 'GET',
        bucket: bucketName,
        key: objectName,
        expires: options?.expires,
        query: options?.process
          ? { 'x-tos-process': options.process }
          : undefined,
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
