import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { basename, join } from 'path';
import { createReadStream } from 'fs';
import { Response } from 'express';
import configs from 'src/configs';
const PORT = configs();
@Controller('public')
export class PublicController {
  @Get('user/:id')
  getNewsImageFile(@Param('id') id: string, @Res() res: Response): void {
    // id ต้องเป็นชื่อไฟล์เท่านั้น — กัน `../` อ่านไฟล์นอกโฟลเดอร์
    if (!id || id === '.' || id === '..' || basename(id) !== id) {
      throw new NotFoundException();
    }
    const file = createReadStream(
      join(`${PORT.pathMountDirUpload}/generate-images`, id),
    );
    // ไม่มีไฟล์ / อ่านไม่ได้ — ถ้าไม่จับ error ของ stream process จะ crash
    file.on('error', () => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.status(404).end();
    });
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `inline; filename="${id}"`,
    });
    file.pipe(res);
  }
}
