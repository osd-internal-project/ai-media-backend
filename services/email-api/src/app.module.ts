import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { EmailModule } from './email/email.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), EmailModule],
  controllers: [AppController],
})
export class AppModule {}
