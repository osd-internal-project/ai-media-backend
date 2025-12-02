import { Controller, Get, Param, Res } from '@nestjs/common';
import { join } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import configs from 'src/configs';
import { MinioClientService } from 'src/minio-client/minio-client.service';
const { pathMountDirUpload, minioBucket } = configs();

@Controller('public')
export class PublicController {
  constructor(private readonly minioService: MinioClientService) {}
  @Get('generate-image/:id')
  getNewsImageFile(@Param('id') id: string, @Res() res: Response): void {
    const file = createReadStream(
      join(`${pathMountDirUpload}/generate-images`, id),
    );
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `inline; filename="${file}"`,
    });
    file.pipe(res);
  }
  @Get('image-minio/:imageName')
  async getPublicImage(
    @Param('imageName') imageName: string,
    @Res() res: Response,
  ) {
    try {
      const decoded = decodeURIComponent(imageName);
      const bucket = minioBucket;
      const stat = await this.minioService.statFile(bucket, decoded);
      if (!stat) return res.status(404).send('File not found');
      const stream = await this.minioService.downloadFile(bucket, decoded);
      stream.on('error', (err) => {
        console.error('MinIO Stream Error:', err);
        if (!res.headersSent) res.status(404).send('File not found');
      });
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader(
        'Content-Type',
        stat.metaData['content-type'] || 'image/jpeg',
      );
      stream.pipe(res);
    } catch (err) {
      console.error('Public Controller Error:', err);
      if (!res.headersSent) res.status(500).send('Internal Server Error');
    }
  }
}
