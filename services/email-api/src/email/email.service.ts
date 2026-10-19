import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import { SendEmailDto } from '@ai-media/share';
import { appConfigs } from '../configs';

/**
 * Directory holding the compiled `.hbs` templates. They are copied to
 * `dist/templates` by nest-cli (`assets: ["**\/*.hbs"]`); this file compiles to
 * `dist/email/email.service.js`, so templates live one level up.
 */
const TEMPLATES_DIR = join(__dirname, '..', 'templates');
const TEMPLATE_NAME = /^[a-z0-9_-]+$/;

/**
 * Sends transactional emails over an unauthenticated SMTP relay using raw
 * nodemailer. Mirrors the working d-service notification `EmailService`:
 * no SMTP auth, plain SMTP (STARTTLS ignored), reading EMAIL_* config.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  // Unauthenticated direct-send relay (no login), identical to the reference service.
  private readonly transporter = nodemailer.createTransport({
    host: appConfigs().EMAIL_HOST,
    port: Number(appConfigs().EMAIL_PORT),
    secure: appConfigs().EMAIL_SECURE, // true for 465, false for STARTTLS/plain
    auth: undefined, // relay needs no credentials
    tls: {
      rejectUnauthorized: false,
    },
    ignoreTLS: true, // send plain, skip STARTTLS (relay cert is *.outlook, host mismatch)
    // nodemailer defaults (2m/30s/10m) outlast the 60s ingress — fail fast instead of hanging
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  /**
   * Renders the email body and sends it through the relay.
   *
   * `from` falls back to EMAIL_FROM so a valid osd.co.th sender is always
   * present — an empty MAIL FROM is what made O365 reject mail as unauthenticated.
   *
   * @param dto recipient + subject + (raw `html` | `template` + `context`) + optional from/cc/bcc
   * @returns `{ success: true, messageId }` on success, `{ success: false, error }` on failure
   */
  async sendMail(dto: SendEmailDto) {
    const html = this.renderBody(dto);
    const from = dto.from ?? appConfigs().EMAIL_FROM;

    try {
      const info = await this.transporter.sendMail({
        from,
        to: dto.to,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        html,
      });
      this.logger.log(`✅ Sent to ${dto.to} | messageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Send failed: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Resolves the HTML body: a raw `dto.html` wins; otherwise the named
   * handlebars template under `templates/` is compiled with `dto.context`.
   *
   * @param dto carries either `html` or `template` (+ optional `context`)
   * @returns rendered HTML string
   * @throws HttpException(500) when the template file cannot be read
   */
  private renderBody(dto: SendEmailDto): string {
    if (dto.html) {
      return dto.html;
    }

    // ชื่อ template เท่านั้น — กัน `../` อ่านไฟล์นอก TEMPLATES_DIR
    if (!TEMPLATE_NAME.test(dto.template ?? '')) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Invalid email template name "${dto.template}"`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    const filePath = join(TEMPLATES_DIR, `${dto.template}.hbs`);
    try {
      const source = readFileSync(filePath, 'utf-8');
      return handlebars.compile(source)(dto.context ?? {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: `Email template "${dto.template}" not found at ${filePath}: ${message}`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
