import { Module } from '@nestjs/common';
import { MinioClientService } from './minio-client.service';
import { MinioModule } from 'nestjs-minio-client';
import { ConfigModule } from '@nestjs/config';
import configs from 'src/configs';
const { minioEndpoint, minioPort, minioAccesskey, minioSecretKey } = configs();
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configs] }),
    MinioModule.register({
      endPoint: minioEndpoint,
      port: +minioPort,
      useSSL: false,
      accessKey: minioAccesskey,
      secretKey: minioSecretKey,
    }),
  ],
  providers: [MinioClientService],
  exports: [MinioClientService],
})
export class MinioClientModule { }
