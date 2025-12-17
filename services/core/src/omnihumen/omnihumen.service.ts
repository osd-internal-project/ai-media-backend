import { Injectable, Logger } from '@nestjs/common';
import { CreateOmnihumanDto } from './dto/create-omnihuman.dto';
import { UpdateOmnihumanDto } from './dto/update-omnihuman.dto';
import { MinioClientService } from 'src/minio-client/minio-client.service';
import { GenerateImageService } from 'src/generate-image/generate-image.service';
import configs from 'src/configs';
const config = configs();
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

@Injectable()
export class OmnihumenService {
  constructor(
    private readonly generateImageService: GenerateImageService,
    private readonly minioclientSerives: MinioClientService,
  ) {}

  async create(
    createOmnihumanDto: CreateOmnihumanDto,
    files: { image?: Express.Multer.File[]; audio?: Express.Multer.File[] },
  ) {
    const baseUrl = configs().pathDomain;

    if (files?.audio && files?.image) {
      const bucketname = config.minioBucketFile;
      const audioExt = path.extname(files.audio[0].originalname); // นามสกุลไฟล์
      const audioFileName = `${uuidv4()}${audioExt}`;
      const audio = await this.minioclientSerives
        .uploadFile(
          files.audio[0].buffer,
          files.audio[0].buffer.length,
          bucketname,
          audioFileName,
        )
        .then(() => {
          const data = {
            filePath: `${bucketname}/${audioFileName}`,
            fileType: files.audio[0].mimetype,
            fileName: audioFileName,
          };
          return this.generateImageService.createFileLogs(data);
        });
      const imageExt = path.extname(files.image[0].originalname); // นามสกุลไฟล์
      const imageFileName = `${uuidv4()}${imageExt}`;
      const image = await this.minioclientSerives
        .uploadFile(
          files.image[0].buffer,
          files.image[0].buffer.length,
          bucketname,
          imageFileName,
        )
        .then(() => {
          const data = {
            filePath: `${bucketname}/${imageFileName}`,
            fileType: files.image[0].mimetype,
            fileName: imageFileName,
          };
          return this.generateImageService.createFileLogs(data);
        });
      const byteplusAccessKeyId = config.byteplusAccessKeyId;
      const byteplusSecretKey = config.byteplusSecretKey;
    }

    return 'This action adds a new omnihuman';
  }

  findAll() {
    return `This action returns all omnihumen`;
  }

  findOne(id: number) {
    return `This action returns a #${id} omnihuman`;
  }

  update(id: number, updateOmnihumanDto: UpdateOmnihumanDto) {
    return `This action updates a #${id} omnihuman`;
  }

  remove(id: number) {
    return `This action removes a #${id} omnihuman`;
  }
}
