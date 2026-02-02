import { Module } from '@nestjs/common';
import { MinioClientService } from './minio-client.service';
import { MinioModule } from 'nestjs-minio-client';
import { ConfigModule } from '@nestjs/config';
import { appConfigs } from 'src/configs';
import { RedisModule } from '@nestjs-modules/ioredis';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfigs] }),
    RedisModule.forRoot({
      type: 'single',
      url: `${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    }),
    MinioModule.register({
      endPoint: appConfigs().minioEndpoint,
      port: +appConfigs().minioPort,
      accessKey: appConfigs().minioAccesskey,
      secretKey: appConfigs().minioSecretKey,
      useSSL: appConfigs().minioUseSsl,
    }),
  ],
  providers: [MinioClientService],
  exports: [MinioClientService],
})
export class MinioClientModule { }
