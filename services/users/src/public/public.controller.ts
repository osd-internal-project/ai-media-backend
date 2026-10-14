import { Controller, Get, Param, Res } from '@nestjs/common';
import { join } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import configs from 'src/configs';
import { Public } from '@ai-media/share';
const PORT = configs();
// ไฟล์สาธารณะ
@Public()
@Controller('public')
export class PublicController {
  @Get('user/:id')
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
