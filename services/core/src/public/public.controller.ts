import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { join } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import configs from 'src/configs';
const PORT = configs();
@Controller('public')
export class PublicController {
  @Get('generate-image/:id')
  getNewsImageFile(@Param('id') id: string, @Res() res: Response): void {
    const file = createReadStream(
      join(`${PORT.pathMountDirUpload}/generate-images`, id),
    );
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `inline; filename="${file}"`,
    });
    file.pipe(res);
  }
}
