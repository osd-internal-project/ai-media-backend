import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { EMAIL_QUEUE } from '@ai-media/share'; // Import จาก Libs
import { appConfigs } from './configs';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: appConfigs().REDIS_HOST,
          port: appConfigs().REDIS_PORT,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
    }),
  ],
  controllers: [AppController],
})
export class AppModule { }