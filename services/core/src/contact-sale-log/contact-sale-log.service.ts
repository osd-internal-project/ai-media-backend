import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ContactSaleLogRepository } from '@ai-media/share';

@Injectable()
export class ContactSaleLogService {
  constructor(private contactSaleLogRepo: ContactSaleLogRepository) {}

  async findMany(args: Prisma.ContactSaleLogFindManyArgs) {
    return this.contactSaleLogRepo.findMany(args);
  }

  async findFirst(args: Prisma.ContactSaleLogFindFirstArgs) {
    return this.contactSaleLogRepo.findOne(args);
  }

  async create(args: Prisma.ContactSaleLogCreateArgs) {
    return this.contactSaleLogRepo.create(args);
  }

  async update(args: Prisma.ContactSaleLogUpdateArgs) {
    return this.contactSaleLogRepo.update(args);
  }

  async delete(args: Prisma.ContactSaleLogDeleteArgs) {
    return this.contactSaleLogRepo.delete(args);
  }
}
