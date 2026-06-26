import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OmiseService } from './omise.service';

@Module({
  imports: [HttpModule],
  providers: [OmiseService],
  exports: [OmiseService],
})
export class OmiseModule {}
