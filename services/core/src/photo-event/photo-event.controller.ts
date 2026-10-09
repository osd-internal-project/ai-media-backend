import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { SetTemplatesDto } from './dto/set-templates.dto';
import { UploadPhotosDto } from './dto/upload-photos.dto';
import { PhotoEventEnabledGuard } from './photo-event-enabled.guard';
import {
  PHOTO_EVENT_DEFAULT_PROMPT_TAIL,
  PHOTO_EVENT_MAX_FILE_BYTES,
  PHOTO_EVENT_MAX_UPLOAD_FILES,
} from './photo-event.constants';
import { PhotoEventGenerationsService } from './photo-event-generations.service';
import { PhotoEventPhotosService } from './photo-event-photos.service';
import { PhotoEventTemplatesService } from './photo-event-templates.service';

@Controller('projects/:projectId/photo-event')
@UseGuards(PhotoEventEnabledGuard)
export class PhotoEventController {
  constructor(
    private readonly templatesService: PhotoEventTemplatesService,
    private readonly photosService: PhotoEventPhotosService,
    private readonly generationsService: PhotoEventGenerationsService,
  ) {}

  @Get('templates')
  findTemplates(@Param('projectId') projectId: string) {
    return this.templatesService.findByProject(projectId);
  }

  @Get('templates/default-prompt-tail')
  getDefaultPromptTail() {
    return { promptTail: PHOTO_EVENT_DEFAULT_PROMPT_TAIL };
  }

  @Put('templates')
  setTemplates(
    @Param('projectId') projectId: string,
    @Body() dto: SetTemplatesDto,
  ) {
    return this.templatesService.setTemplates(projectId, dto);
  }

  @Get('photos')
  findPhotos(@Param('projectId') projectId: string) {
    return this.photosService.findByProject(projectId);
  }

  @Post('photos')
  @UseInterceptors(
    FilesInterceptor('files', PHOTO_EVENT_MAX_UPLOAD_FILES, {
      limits: { fileSize: PHOTO_EVENT_MAX_FILE_BYTES },
    }),
  )
  uploadPhotos(
    @Param('projectId') projectId: string,
    @Body() dto: UploadPhotosDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.photosService.upload(projectId, dto, files);
  }

  @Delete('photos/:photoId')
  removePhoto(
    @Param('projectId') projectId: string,
    @Param('photoId') photoId: string,
    @Query('userId') userId: string,
  ) {
    return this.photosService.remove(projectId, photoId, userId);
  }

  @Post('generations')
  createGeneration(
    @Param('projectId') projectId: string,
    @Body() dto: CreateGenerationDto,
  ) {
    return this.generationsService.create(projectId, dto);
  }

  @Get('generations/:generationId')
  findGeneration(
    @Param('projectId') projectId: string,
    @Param('generationId') generationId: string,
  ) {
    return this.generationsService.findOne(projectId, generationId);
  }
}
