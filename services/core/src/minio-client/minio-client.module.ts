import { Module } from '@nestjs/common';
import { MinioClientService } from './minio-client.service';
import { MinioModule } from 'nestjs-minio-client';
import { ConfigModule } from '@nestjs/config';
import { minioConfigs } from 'src/configs';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [minioConfigs] }),
    MinioModule.register({
      endPoint: minioConfigs().minioEndpoint,
      port: +minioConfigs().minioPort,
      accessKey: minioConfigs().minioAccesskey,
      secretKey: minioConfigs().minioSecretKey,
      useSSL: minioConfigs().minioUseSsl,
    }),
  ],
  providers: [MinioClientService],
  exports: [MinioClientService],
})
export class MinioClientModule { }
