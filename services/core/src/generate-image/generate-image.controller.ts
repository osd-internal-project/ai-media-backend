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
import { diskStorage } from 'multer';
import configs from 'src/configs';
import { extname, join } from 'path';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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
      storage: diskStorage({
        destination: `${config.pathMountDirUpload}/generate-images`,
        filename: (req, file, callback) => {
          const fileCode = `${uuidv4()}`;
          const fileType = extname(file.originalname);
          callback(null, `${fileCode}${fileType}`);
        },
      }),
    }),
  )
  async uploadImage(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('type') type,
  ) {
    if (type && files.length > 0) {
      const data = files.map((file) => ({
        filePath: `${config.pathMountDirUpload}/generate-images/${file.filename}`,
        fileType: file.mimetype,
        fileName: Buffer.from(file.filename, 'latin1').toString('utf8'),
      }));
      return await this.GenerateImageService.upload(data);
    }
  }
}
