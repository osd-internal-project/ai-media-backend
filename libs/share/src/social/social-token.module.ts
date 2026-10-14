import { Module } from '@nestjs/common';
import { PrismaModule } from '../modules/prisma/prisma.module';
import { SocialTokenService } from './social-token.service';

@Module({
  imports: [PrismaModule],
  providers: [SocialTokenService],
  exports: [SocialTokenService],
})
export class SocialTokenModule {}
