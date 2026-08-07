import { Module } from '@nestjs/common';
import { TosModule } from '../tos-sdk';
import { StorageUrlService } from './storage-url.service';

@Module({
  imports: [TosModule],
  providers: [StorageUrlService],
  exports: [StorageUrlService],
})
export class StorageModule {}
