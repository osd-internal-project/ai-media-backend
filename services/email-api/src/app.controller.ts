import { Body, Controller, Logger, Post } from '@nestjs/common';
import { SendEmailDto } from '@ai-media/share';
import { EmailService } from './email/email.service';

@Controller('email')
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * Send an email synchronously through the unauthenticated relay.
   *
   * Body is rendered from a Handlebars `template` (+ `context`) or, when `dto.html`
   * is provided, sent as raw HTML. Supports optional `from`/`cc`/`bcc`.
   *
   * @param dto recipient + subject + (template/context | html) + optional from/cc/bcc
   * @returns `{ success: true, messageId }` on success, `{ success: false, error }` on failure
   */
  @Post('send')
  async sendEmail(@Body() dto: SendEmailDto) {
    // Body must come from a template or raw html — one of them is required.
    if (!dto.template && !dto.html) {
      return {
        success: false,
        error: 'Either "template" or "html" must be provided',
      };
    }

    this.logger.log(`📨 Sending email to: ${dto.to}`);
    return this.emailService.sendMail(dto);
  }
}
