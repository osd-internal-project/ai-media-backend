import { Controller, Post, Body } from '@nestjs/common';
import { ContactSaleLogService } from './contact-sale-log.service';
import { Prisma } from '@prisma/client';

@Controller('contact-sale-log')
export class ContactSaleLogController {
  constructor(private readonly contactSaleLogService: ContactSaleLogService) {}

  @Post()
  async createContactSaleLog(@Body() payload: Prisma.ContactSaleLogCreateInput) {
    console.log(payload)
    return this.contactSaleLogService.create({
      data:payload
    });
  }
}
