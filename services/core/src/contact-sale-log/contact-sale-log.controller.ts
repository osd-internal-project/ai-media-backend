import { Controller, Post, Body } from '@nestjs/common';
import { ContactSaleLogService } from './contact-sale-log.service';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EMAIL_QUEUE, SEND_EMAIL_EVENT } from '@ai-media/share';

@Controller('contact-sale-log')
export class ContactSaleLogController {
  constructor(
    private readonly contactSaleLogService: ContactSaleLogService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  @Post()
  async createContactSaleLog(@Body() payload: Prisma.ContactSaleLogCreateInput) {
    console.log(payload)
    const newLog = await this.contactSaleLogService.create({
      data: payload
    });

    // Send email alert to admin
    await this.emailQueue.add(SEND_EMAIL_EVENT, {
      to: 'osd_support@osd.co.th', // Sending to ourselves (admin/support)
      subject: '🚨 New Contact Sales Submission',
      template: 'contact-sale',
      context: {
        firstName: newLog.firstName,
        lastName: newLog.lastName,
        email: newLog.email,
        companyName: newLog.companyName || '-',
        phoneNumber: newLog.phoneNumber,
        message: newLog.message,
        // Format time nicely or use ISO
        createdAt: newLog.createdAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      }
    });

    return newLog;
  }
}
