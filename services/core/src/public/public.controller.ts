import { Controller, Get, Param, Res } from '@nestjs/common';
import { join } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import configs from 'src/configs';
import { MinioClientService } from 'src/minio-client/minio-client.service';
const { minioBucket, minioBucketVdo, minioBucketUpload, minioBucketFile } =
  configs();

@Controller('public')
export class PublicController {
  constructor(private readonly minioService: MinioClientService) {}

  @Get('generate-image/:id')
  async getNewsImageFile(@Param('id') id: string, @Res() res: Response) {
    try {
      console.log('imageName', id);
      const decoded = decodeURIComponent(id);
      console.log('decoded', decoded);
      const bucket = minioBucketUpload;
      // ตรวจสอบว่าไฟล์มีอยู่จริง
      const stat = await this.minioService.statFile(bucket, decoded);
      if (!stat) return res.status(404).send('File not found');
      const stream = await this.minioService.downloadFile(bucket, decoded);
      // ป้องกัน error จาก stream
      stream.on('error', (err) => {
        console.error('MinIO Stream Error:', err);
        if (!res.headersSent) res.status(500).send('Error streaming file');
      });
      // ระบุ content-type ให้ถูกต้องที่สุด
      const contentType =
        stat.metaData?.['content-type'] ||
        stat.metaData?.['Content-Type'] ||
        'image/jpeg';
      res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
      });

      return stream.pipe(res);
    } catch (err) {
      console.error('Public Controller Error:', err);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  }

  @Get('image-minio/:imageName')
  async getPublicImage(
    @Param('imageName') imageName: string,
    @Res() res: Response,
  ) {
    try {
      const decodedName = decodeURIComponent(imageName);
      const bucket = minioBucket;

      // เช็คว่าไฟล์มีจริง
      const stat = await this.minioService.statFile(bucket, decodedName);
      if (!stat) return res.status(404).send('File not found');

      // โหลดไฟล์จาก MinIO
      const stream = await this.minioService.downloadFile(bucket, decodedName);

      // หาก stream error
      stream.on('error', (err) => {
        console.error('MinIO Stream Error:', err);
        if (!res.headersSent) res.status(500).send('Error reading file');
      });

      // ⚠ ระบุ content-type ให้ชัดเจน
      const contentType =
        stat.metaData?.['content-type'] ||
        stat.metaData?.['Content-Type'] ||
        'application/octet-stream';

      res.set({
        'Access-Control-Allow-Origin': '*',
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
      });

      // ส่ง stream ออกไป
      return stream.pipe(res);
    } catch (err) {
      console.error('Public Controller Error:', err);
      if (!res.headersSent)
        return res.status(500).send('Internal Server Error');
    }
  }

  @Get('vdo-minio/:vdoName')
  async getPublicVdo(@Param('vdoName') vdoName: string, @Res() res: Response) {
    try {
      const decodedName = decodeURIComponent(vdoName);
      const bucket = minioBucketVdo;

      // // เช็คไฟล์ใน MinIO
      // const stat = await this.minioService.statFile(bucket, decodedName);
      // if (!stat) return res.status(404).send('File not found');

      // const fileSize = stat.size;
      // const contentType =
      //   stat.metaData?.['content-type'] ||
      //   stat.metaData?.['Content-Type'] ||
      //   'video/mp4'; // default

      // // ไม่มี Range → ส่งทั้งไฟล์
      // const stream = await this.minioService.downloadFile(bucket, decodedName);

      // res.writeHead(200, {
      //   'Content-Length': fileSize,
      //   'Content-Type': contentType,
      // });

      // return stream.pipe(res);
      const url = await this.minioService.getPresignedUrl(
        bucket,
        decodedName,
      );
      console.log(url)
      return { url };
    } catch (err) {
      console.error('Public Controller Error:', err);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  }

  @Get('minio-file/:file')
  async getPublicFile(@Param('file') file: string, @Res() res: Response) {
    try {
      const decodedName = decodeURIComponent(file);
      const bucket = minioBucketFile;

      // เช็คไฟล์ใน MinIO
      const stat = await this.minioService.statFile(bucket, decodedName);
      if (!stat) return res.status(404).send('File not found');

      const fileSize = stat.size;
      const contentType =
        stat.metaData?.['content-type'] ||
        stat.metaData?.['Content-Type'] ||
        'video/mp4'; // default

      // ไม่มี Range → ส่งทั้งไฟล์
      const stream = await this.minioService.downloadFile(bucket, decodedName);

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });

      return stream.pipe(res);
    } catch (err) {
      console.error('Public Controller Error:', err);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  }
}
