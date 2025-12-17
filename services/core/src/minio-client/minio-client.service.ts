import { Injectable, Logger } from '@nestjs/common';
import { MinioService } from 'nestjs-minio-client';
import configs from 'src/configs';
@Injectable()
export class MinioClientService {
  constructor(private readonly minio: MinioService) { }
  private get minioClient() {
    return this.minio.client;
  }

  public async uploadFile(
    file: Buffer,
    size: number,
    baseBucket: string,
    path: string,
  ) {
    const fileBuffer = file;
    return this.minioClient.putObject(baseBucket, path, fileBuffer, size);
  }
  async deleteFile(objetName: string, baseBucket: string) {
    return await this.minioClient.removeObject(baseBucket, objetName);
  }

  public async downloadFile(bucket: string, fileName: string) {
    Logger.debug(`Bucket : ${bucket}`);
    Logger.debug(`Path : ${fileName}`);
    const res = await this.minioClient.getObject(bucket, fileName);
    return res;
  }

  public async statFile(bucket: string, fileName: string) {
    try {
      const stat = await this.minioClient.statObject(bucket, fileName);
      return stat; // stat.metaData['content-type'] สามารถใช้ได้
    } catch (err) {
      console.error('MinIO statObject error:', err);
      return null; // ถ้าไม่มีไฟล์
    }
  }

  async getPresignedUrl(bucket: string, filename: string): Promise<string> {
    // สร้าง URL ชั่วคราว (เช่น อยู่ได้ 15 นาที) ให้ Frontend ไปโหลดเอง
    return await this.minioClient.presignedGetObject(bucket, filename, 15 * 60);
  }
}
