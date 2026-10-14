// 1. DTO
import { IsEmail, IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

/**
 * Payload for sending an email through the email-api `POST /email/send` endpoint.
 *
 * Body is either a Handlebars `template` (+ `context`) OR a raw `html` string.
 * At least one of `template` / `html` must be provided — this is enforced in the
 * controller because class-validator can't cleanly express the "one of" rule.
 */
export class SendEmailDto {
    @IsEmail()
    @IsNotEmpty()
    to: string;

    @IsString()
    @IsNotEmpty()
    subject: string;

    // Optional sender override; defaults to SMTP_FROM when omitted.
    @IsEmail()
    @IsOptional()
    from?: string;

    // Comma-separated address list (e.g. 'a@osd.co.th, b@osd.co.th'), like nodemailer.
    @IsString()
    @IsOptional()
    cc?: string;

    @IsString()
    @IsOptional()
    bcc?: string;

    // Handlebars template name (without extension). Optional when `html` is given.
    @IsString()
    @IsOptional()
    template?: string;

    // Raw HTML body. When provided it bypasses template rendering.
    @IsString()
    @IsOptional()
    html?: string;

    @IsObject()
    @IsOptional()
    context?: Record<string, any>;
}

// 2. Constants (ค่าคงที่)
// NOTE: EMAIL_QUEUE / SEND_EMAIL_EVENT are unused now that email-api sends
// synchronously (no BullMQ). Kept for the legacy email-worker until it is removed.
export const EMAIL_SERVICE = 'EMAIL_SERVICE';
export const EMAIL_QUEUE = 'email_queue';
export const SEND_EMAIL_EVENT = 'send_email'; // ชื่อ Event pattern
