import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

/**
 * Email module. Exports EmailService so the controller (and any future
 * feature module) can inject it to send templated or raw-html emails.
 */
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
