// import { Module } from '@nestjs/common';
// import { MinioClientService } from './minio-client.service';
// import { MinioModule } from 'nestjs-minio-client';
// import { ConfigModule } from '@nestjs/config';
// import { minioConfigs } from 'src/configs';
// import { RedisModule } from '@nestjs-modules/ioredis';
// @Module({
//   imports: [
//     ConfigModule.forRoot({ isGlobal: true, load: [minioConfigs] }),
//     RedisModule.forRoot({
//       type: 'single',
//       url: `${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
//     }),
//     MinioModule.register({
//       endPoint: minioConfigs().minioEndpoint,
//       port: +minioConfigs().minioPort,
//       accessKey: minioConfigs().minioAccesskey,
//       secretKey: minioConfigs().minioSecretKey,
//       useSSL: minioConfigs().minioUseSsl,
//     }),
//   ],
//   providers: [MinioClientService],
//   exports: [MinioClientService],
// })
// export class MinioClientModule { }
