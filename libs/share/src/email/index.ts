// 1. DTO (Copy อันเดิมมาได้เลย)
import { IsEmail, IsNotEmpty, IsString, IsOptional, IsObject } from 'class-validator';

export class SendEmailDto {
    @IsEmail()
    @IsNotEmpty()
    to: string;

    @IsString()
    @IsNotEmpty()
    subject: string;

    @IsString()
    @IsNotEmpty()
    template: string;

    @IsObject()
    @IsOptional()
    context?: Record<string, any>;
}

// 2. Constants (ค่าคงที่)
export const EMAIL_SERVICE = 'EMAIL_SERVICE';
export const EMAIL_QUEUE = 'email_queue';
export const SEND_EMAIL_EVENT = 'send_email'; // ชื่อ Event pattern