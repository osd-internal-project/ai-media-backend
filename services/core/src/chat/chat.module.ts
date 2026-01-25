import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MinioClientModule } from 'src/minio-client/minio-client.module';
import { PrismaModule } from '@ai-media/share';

@Module({
  imports: [PrismaModule, MinioClientModule],
  controllers: [ChatController],
  providers: [ChatService]
})
export class ChatModule { }
