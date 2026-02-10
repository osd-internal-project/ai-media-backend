import { Module } from '@nestjs/common';
import { TosService } from './tos.service';

@Module({
    providers: [TosService],
    exports: [TosService],
})
export class TosModule { }
