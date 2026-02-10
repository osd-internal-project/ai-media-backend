import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailerService } from '@nestjs-modules/mailer';
import { SendEmailDto, SEND_EMAIL_EVENT, EMAIL_QUEUE } from '@ai-media/share';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
    private readonly logger = new Logger(EmailProcessor.name);

    constructor(private readonly mailerService: MailerService) {
        super();
    }

    async process(job: Job<SendEmailDto>) {
        if (job.name !== SEND_EMAIL_EVENT) {
            this.logger.warn(`Unknown job name: ${job.name}`);
            return;
        }
        const data = job.data;
        this.logger.log(`📨 Processing job for: ${data.to}`);

        try {
            await this.mailerService.sendMail({
                to: data.to,
                subject: data.subject,
                template: `./${data.template}`,
                context: data.context,
            });

            this.logger.log(`✅ Sent to ${data.to}`);
            return { success: true };

        } catch (error) {
            this.logger.error(`❌ Error: ${error.message}`);
            throw error; // BullMQ will handle retries
        }
    }
}