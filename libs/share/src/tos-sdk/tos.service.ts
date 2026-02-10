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

  async getPreSignedUrl(bucketName: string, objectName: string) {
    try {
      const url = this.client.getPreSignedUrl({
        method: 'GET',
        bucket: bucketName,
        key: objectName,
      });
      // console.log('PreSignedUrl:', url);
      return url;
    } catch (error) {
      handleError(error);
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
