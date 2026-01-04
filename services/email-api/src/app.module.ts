import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { EMAIL_SERVICE, EMAIL_QUEUE } from '@ai-media/share'; // Import จาก Libs
import { appConfigs } from './configs';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.register([
      {
        name: EMAIL_SERVICE,
        transport: Transport.RMQ,
        options: {
          urls: [appConfigs().RABBITMQ_URL],
          queue: EMAIL_QUEUE,
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [AppController],
})
export class AppModule { }