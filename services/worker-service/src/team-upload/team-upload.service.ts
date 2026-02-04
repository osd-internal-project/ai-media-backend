import { Injectable } from '@nestjs/common';
import { TosService } from '@ai-media/share';
import { TosClient, TosClientError, TosServerError } from '@volcengine/tos-sdk';
@Injectable()
export class TeamUploadService {
  // constructor(private readonly tosService: TosService) { }
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
   
  // async upload(body: any, file: Express.Multer.File) {
  //     console.log(body);
  //     console.log(file);
  //     // const data = await this.tosService.putObject('ai-cave-sit', file.filename, file.buffer);

  //     return data;
  // }

  async putObject(bucketName: string, objectName: string, body: Buffer) {
    try {
      console.log(bucketName, objectName, body);
      await this.client.putObject({
        bucket: bucketName,
        key: objectName,
        body: body,
      });
      //   const { data } = await this.client.headObject({
      //     bucket: bucketName,
      //     key: objectName,
      //   });
      //   return data;
    } catch (error) {
      if (error instanceof TosClientError) {
        console.log('Client Err Msg:', error.message);
        console.log('Client Err Stack:', error.stack);
      } else if (error instanceof TosServerError) {
        console.log('Request ID:', error.requestId);
        console.log('Response Status Code:', error.statusCode);
        console.log('Response Header:', error.headers);
        console.log('Response Err Code:', error.code);
        console.log('Response Err Msg:', error.message);
      } else {
        console.log('unexpected exception, message: ', error);
      }
    }
  }
  async test() {
    // console.log(this.client);
    try {
      const { data } = await this.client.listBuckets();
      const theBucket = data.Buckets.find((it) => it.Name === this.bucket);
      console.log('the bucket info', theBucket);
    } catch (error) {
      if (error instanceof TosClientError) {
        console.log('Client Err Msg:', error.message);
        console.log('Client Err Stack:', error.stack);
      } else if (error instanceof TosServerError) {
        console.log('Request ID:', error.requestId);
        console.log('Response Status Code:', error.statusCode);
        console.log('Response Header:', error.headers);
        console.log('Response Err Code:', error.code);
        console.log('Response Err Msg:', error.message);
      } else {
        console.log('unexpected exception, message: ', error);
      }
    }
  }
}
