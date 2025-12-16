import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthguardService } from './authguard.service';

@Module({
  providers: [JwtService, AuthguardService],
  exports: [JwtService, AuthguardService],
})
export class AuthguardModule {}
