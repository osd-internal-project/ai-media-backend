import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UploadedFiles,
  UseInterceptors,
  Query,
  Res,
  Inject,
} from '@nestjs/common';
import { GenerateImageService } from './generate-image.service';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { minioConfigs } from 'src/configs';
import { ConfigType } from '@nestjs/config';

@Controller('generate-image')
export class GenerateImageController {
  constructor(
    @Inject(minioConfigs.KEY)
    private config: ConfigType<typeof minioConfigs>,
    private readonly GenerateImageService: GenerateImageService,
    private readonly minioclientSerives: MinioClientService,
  ) { }

  @Post()
  create(@Body('body') createGenerateImageDto: CreateGenerateImageDto) {
    return this.GenerateImageService.create(createGenerateImageDto);
  }

  @Get()
  findAll(
    @Query() query: any,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.GenerateImageService.findAll(query, +skip, +take);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.GenerateImageService.findOne(id);
  }

  @Get('new/:id')
  findOneNew(@Param('id') id: string) {
    return this.GenerateImageService.findOneNew(id);
  }

  @Get('download/:imageName')
  async download(@Param('imageName') imageName: string, @Res() res: Response) {
    try {
      const decoded = decodeURIComponent(imageName);
      const bucket = this.config.minioBucket;
      const stream = await this.minioclientSerives.downloadFile(
        bucket,
        decoded,
      );
      stream.on('data', () => console.log('Receiving data chunk...'));
      stream.on('end', () =>
        console.log('Stream ended - file fully read from MinIO'),
      );
      stream.on('error', (err) => console.error('Stream error:', err));
      res.on('finish', () => console.log('Response finished sending file'));
      res.on('close', () => console.log('Connection closed by client'));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${imageName}"`,
      );
      res.setHeader('Content-Type', 'application/octet-stream');
      stream.on('error', () => {
        return res.status(404).send('File not found');
      });
      stream.pipe(res);
    } catch (err) {
      res.status(500).send('Internal Server Error');
    }
  }

  @Get('download-vdo/:vdoName')
  async downloadvdo(@Param('vdoName') vdoName: string, @Res() res: Response) {
    try {
      const decoded = decodeURIComponent(vdoName);
      console.log(decoded);
      const bucket = this.config.minioBucketVdo;
      const stream = await this.minioclientSerives.downloadFile(
        bucket,
        decoded,
      );
      // stream.on('data', () => console.log('Receiving data chunk...'));
      stream.on('end', () =>
        console.log('Stream ended - file fully read from MinIO'),
      );
      stream.on('error', (err) => console.error('Stream error:', err));
      res.on('finish', () => console.log('Response finished sending file'));
      res.on('close', () => console.log('Connection closed by client'));
      res.setHeader('Content-Disposition', `attachment; filename="${vdoName}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      stream.on('error', () => {
        return res.status(404).send('File not found');
      });
      stream.pipe(res);
    } catch (err) {
      res.status(500).send('Internal Server Error');
    }
  }

  @Get('get-image/:imageName')
  async GetImageFind(
    @Param('imageName') imageName: string,
    @Res() res: Response,
  ) {
    try {
      const decoded = decodeURIComponent(imageName);

      // Set CORS headers for cross-origin requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      let bucket = this.config.minioBucketUpload;
      let fileStats = await this.minioclientSerives.statFile(bucket, decoded);

      if (!fileStats) {
        bucket = this.config.minioBucket;
        fileStats = await this.minioclientSerives.statFile(bucket, decoded);
      }

      if (!fileStats) {
        console.log(`[DEBUG] Image not found in any bucket: ${decoded}`);
        return res.status(404).send('File not found');
      }

      res.setHeader('Content-Type', 'image/jpeg');
      const stream = await this.minioclientSerives.downloadFile(
        bucket,
        decoded,
      );
      stream.on('data', () => console.log('Receiving data chunk...'));
      stream.on('end', () =>
        console.log('Stream ended - file fully read from MinIO'),
      );
      stream.on('error', (err) => console.error('Stream error:', err));
      res.on('finish', () => console.log('Response finished sending file'));
      res.on('close', () => console.log('Connection closed by client'));
      stream.on('error', () => {
        return res.status(404).send('File not found');
      });
      stream.pipe(res);
    } catch (err) {
      res.status(500).send('Internal Server Error');
    }
  }

  @Get('get-reference-image/:imageName')
  async getReferenceImage(
    @Param('imageName') imageName: string,
    @Res() res: Response,
  ) {
    try {
      const decoded = decodeURIComponent(imageName);
      const bucket = this.config.minioBucketUpload;

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      const fileStats = await this.minioclientSerives.statFile(bucket, decoded);
      if (!fileStats) {
        console.log(`[DEBUG] Reference image not found: ${bucket}/${decoded}`);
        res.setHeader('Content-Type', 'image/svg+xml');
        const placeholder = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" fill="#333"/><text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-family="Arial" font-size="8" fill="#666">No Image</text></svg>`;
        return res.send(placeholder);
      }

      res.setHeader('Content-Type', 'image/jpeg');
      const stream = await this.minioclientSerives.downloadFile(
        bucket,
        decoded,
      );
      stream.on('error', (err) => {
        console.error('Reference image stream error:', err);
        return res.status(404).send('File not found');
      });
      stream.pipe(res);
    } catch (err) {
      console.error(`[DEBUG] Error serving reference image: ${err}`);
      res.status(500).send('Internal Server Error');
    }
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateGenerateImageDto: UpdateGenerateImageDto,
  ) {
    return this.GenerateImageService.update(+id, updateGenerateImageDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.GenerateImageService.remove(+id);
  }

  @Post('upload-images')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
    }),
  )
  async uploadImage(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('type') type,
  ) {
    if (type && files.length > 0) {
      const bucketname = this.config.minioBucketUpload;
      const savedFiles = await Promise.all(
        files.map((file) => {
          const ext = path.extname(file.originalname); // นามสกุลไฟล์
          const fileName = `${uuidv4()}${ext}`;
          this.minioclientSerives.uploadFile(
            file.buffer,
            file.buffer.length,
            bucketname,
            fileName,
          );
          return {
            filePath: `${bucketname}/${fileName}`,
            fileType: file.mimetype,
            fileName: fileName,
          };
        }),
      );

      console.log('All files uploaded!');
      // const data = files.map((file) => {
      //   const ext = path.extname(file.originalname); // นามสกุลไฟล์
      //   const fileName = `${uuidv4()}${ext}`;
      //   Logger.debug(fileName);
      //   return {
      //     filePath: `${bucketname}/${fileName}`,
      //     fileType: file.mimetype,
      //     fileName: fileName,
      //   };
      // });

      const fileList = await this.GenerateImageService.upload(savedFiles);
      console.log(fileList);
      return fileList;
    }
  }
}
