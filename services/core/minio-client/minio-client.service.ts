import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { MinioService } from 'nestjs-minio-client';
import { Stream } from 'stream';
import { BufferedFile } from './file.model';
import * as crypto from 'crypto';
import configs from '../configs';
@Injectable()
export class MinioClientService {
  constructor(private readonly minio: MinioService) {}
  private get minioClient() {
    return this.minio.client;
  }

  public async uploadFile(
    file: Buffer,
    size: number,
    baseBucket: string,
    path: string,
  ) {
    Logger.debug(`Bucket : ${baseBucket}`);
    Logger.debug(`Path : ${path}`);
    Logger.error('file:', file);
    const metaData = {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'X-Amz-Meta-Testing': '1234',
    } as any;
    const fileBuffer = file;
    return this.minioClient.putObject(
      configs().minioBucket,
      path,
      fileBuffer,
      size,
      metaData,
    );
  }
  async deleteFile(objetName: string, baseBucket: string) {
    return await this.minioClient.removeObject(baseBucket, objetName);
  }

  public async downloadFile(bucket: string, fileName: string) {
    Logger.debug(`Bucket : ${bucket}`);
    Logger.debug(`Path : ${fileName}`);
    return await this.minioClient.getObject(bucket, fileName);
  }
}
