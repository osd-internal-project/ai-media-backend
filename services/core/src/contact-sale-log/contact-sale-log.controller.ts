import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ContactSaleLogService } from './contact-sale-log.service';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';

import { appConfigs } from 'src/configs';
import { HttpService } from '@nestjs/axios';

@Controller('contact-sale-log')
export class ContactSaleLogController {
  constructor(
    private readonly contactSaleLogService: ContactSaleLogService,
    private readonly httpService: HttpService,
  ) {}

  @Post()
  async createContactSaleLog(
    @Body() payload: Prisma.ContactSaleLogCreateInput,
  ) {
    const newLog = await this.contactSaleLogService.create({
      data: payload,
    });

    // Send email alert to admin
    const receiveEmail = appConfigs().receiveEmail;
    
    const emailPayload = {
      to: receiveEmail, // Sending to ourselves (admin/support)
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
        createdAt: newLog.createdAt.toLocaleString('th-TH', {
          timeZone: 'Asia/Bangkok',
        }),
      },
    };
    try {
      const emailApiUrl = appConfigs().emailApiUrl;
      const { data } = await firstValueFrom(
        this.httpService.post(`${emailApiUrl}/email/send`, emailPayload),
      );
      Logger.log(`Email sent: ${JSON.stringify(data)}`);
    } catch (error) {
      Logger.error(`Failed to send email: ${error.message}`);
      // Not throwing error to avoid rolling back invitation? Or should we?
      // Usually better to log failure but leave invitation pending so admin can resend or manual link.
    }

    return newLog;
  }
}
