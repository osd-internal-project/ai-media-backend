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
} from '@nestjs/common';
import { GenerateImageService } from './generate-image.service';
import { CreateGenerateImageDto } from './dto/create-generate-image.dto';
import { UpdateGenerateImageDto } from './dto/update-generate-image.dto';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import configs from 'src/configs';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';
const config = configs();

@Controller('generate-image')
export class GenerateImageController {
  constructor(private readonly GenerateImageService: GenerateImageService) {}

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
    FilesInterceptor('files', 1, {
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
      const data = {
        filePath: `${config.pathMountDirUpload}/generate-images/${files[0].filename}`,
        fileType: files[0].mimetype,
        fileName: Buffer.from(files[0].filename, 'latin1').toString('utf8'),
        generateImageId: '',
      } as Prisma.GenerateImageCreateInput;
      return this.GenerateImageService.upload(data);
    }
  }
}
