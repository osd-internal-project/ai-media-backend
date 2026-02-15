// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Patch,
//   Param,
//   Delete,
//   UseInterceptors,
//   UploadedFiles,
//   Logger,
// } from '@nestjs/common';
// import { OmnihumenService } from './omnihumen.service';
// import { CreateOmnihumenDto } from './dto/create-omnihumen.dto';
// import { UpdateOmnihumenDto } from './dto/update-omnihumen.dto';
// import { FileFieldsInterceptor } from '@nestjs/platform-express';

// @Controller('omnihumen')
// export class OmnihumenController {
//   constructor(private readonly omnihumenService: OmnihumenService) {}

//   @Post()
//   @UseInterceptors(
//     FileFieldsInterceptor([
//       { name: 'image', maxCount: 1 },
//       { name: 'audio', maxCount: 1 },
//     ]),
//   )
//   create(
//     @UploadedFiles()
//     files: { image?: Express.Multer.File[]; audio?: Express.Multer.File[] },
//     @Body() createOmnihumenDto: CreateOmnihumenDto,
//   ) {
//     const data = this.omnihumenService.create(createOmnihumenDto, files);
//     Logger.debug(data);
//     return data;
//   }

//   @Get()
//   findAll() {
//     return this.omnihumenService.findAll();
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.omnihumenService.findOne(+id);
//   }

//   @Patch(':id')
//   update(
//     @Param('id') id: string,
//     @Body() updateOmnihumenDto: UpdateOmnihumenDto,
//   ) {
//     return this.omnihumenService.update(+id, updateOmnihumenDto);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.omnihumenService.remove(+id);
//   }
// }
