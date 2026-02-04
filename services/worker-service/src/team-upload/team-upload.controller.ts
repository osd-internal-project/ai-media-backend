import { Body, Controller, Get, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { TeamUploadService } from './team-upload.service';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('team-upload')
export class TeamUploadController { 
  constructor(private readonly teamUploadService: TeamUploadService) { }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Body() body: any, @UploadedFile() file: Express.Multer.File) {
    console.log( file);
    return this.teamUploadService.putObject('ai-cave-sit',file.originalname,file.buffer);
  }

  @Get('test')
  async test() {
    return this.teamUploadService.test();
  }

}
