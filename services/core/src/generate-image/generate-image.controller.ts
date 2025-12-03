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
} from '@nestjs/common';
import { GenerateImageService } from './generate-image.service';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import configs from 'src/configs';
import { Response } from 'express';
import { MinioClientService } from 'src/minio-client/minio-client.service';
const config = configs();

@Controller('generate-image')
export class GenerateImageController {
  constructor(
    private readonly GenerateImageService: GenerateImageService,
    private readonly minioclientSerives: MinioClientService,
  ) {}

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

  @Get('download/:imageName')
  async download(@Param('imageName') imageName: string, @Res() res: Response) {
    try {
      const decoded = decodeURIComponent(imageName);
      const bucket = config.minioBucket;
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
      const bucket = config.minioBucketVdo;
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
      const bucket = config.minioBucket;
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
      res.setHeader('Content-Type', 'image/jpeg');
      stream.on('error', () => {
        return res.status(404).send('File not found');
      });
      stream.pipe(res);
    } catch (err) {
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
      const bucketname = config.minioBucketUpload;
      await Promise.all(
        files.map((file) => {
          const fileName = Buffer.from(file.originalname, 'latin1').toString(
            'utf8',
          );
          return this.minioclientSerives.uploadFile(
            file.buffer,
            file.buffer.length,
            bucketname,
            fileName,
          );
        }),
      );

      console.log('All files uploaded!');
      const data = files.map((file) => {
        const decoded = Buffer.from(file.originalname, 'latin1').toString(
          'utf8',
        );
        return {
          filePath: `${bucketname}/${decoded}`,
          fileType: file.mimetype,
          fileName: decoded,
        };
      });
      return await this.GenerateImageService.upload(data);
    }
  }
}
