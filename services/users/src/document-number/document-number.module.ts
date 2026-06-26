import { Module } from '@nestjs/common';
import { PrismaModule } from '@ai-media/share';
import { DocumentNumberService } from './document-number.service';

@Module({
  imports: [PrismaModule],
  providers: [DocumentNumberService],
  exports: [DocumentNumberService],
})
export class DocumentNumberModule {}
