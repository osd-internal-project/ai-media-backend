import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { MailerService } from '@nestjs-modules/mailer';
import { SendEmailDto, SEND_EMAIL_EVENT } from '@ai-media/share';

@Controller()
export class EmailProcessor {
    private readonly logger = new Logger(EmailProcessor.name);

    constructor(private readonly mailerService: MailerService) { }

    @EventPattern(SEND_EMAIL_EVENT)
    async handleSendEmail(@Payload() data: SendEmailDto, @Ctx() context: RmqContext) {
        const channel = context.getChannelRef();
        const originalMsg = context.getMessage();

        this.logger.log(`📨 Processing job for: ${data.to}`);

        try {
            await this.mailerService.sendMail({
                to: data.to,
                subject: data.subject,
                template: `./${data.template}`,
                context: data.context,
            });

            this.logger.log(`✅ Sent to ${data.to}`);
            channel.ack(originalMsg); // งานเสร็จสมบูรณ์

        } catch (error) {
            this.logger.error(`❌ Error: ${error.message}`);
            // Ack ทิ้งเพื่อป้องกัน Loop (Production ควรใช้ DLQ)
            channel.ack(originalMsg);
        }
    }
}