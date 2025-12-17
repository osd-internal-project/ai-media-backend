import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  UploadedFiles,
  Logger,
} from '@nestjs/common';
import { OmnihumenService } from './omnihumen.service';
import { CreateOmnihumanDto } from './dto/create-omnihuman.dto';
import { UpdateOmnihumanDto } from './dto/update-omnihuman.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@Controller('omnihumen')
export class OmnihumenController {
  constructor(private readonly omnihumenService: OmnihumenService) {}

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'image', maxCount: 1 },
      { name: 'audio', maxCount: 1 },
    ]),
  )
  create(
    @UploadedFiles()
    files: { image?: Express.Multer.File[]; audio?: Express.Multer.File[] },
    @Body() createOmnihumanDto: CreateOmnihumanDto,
  ) {
    return this.omnihumenService.create(createOmnihumanDto, files);
  }

  @Get()
  findAll() {
    return this.omnihumenService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.omnihumenService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOmnihumanDto: UpdateOmnihumanDto,
  ) {
    return this.omnihumenService.update(+id, updateOmnihumanDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.omnihumenService.remove(+id);
  }
}
