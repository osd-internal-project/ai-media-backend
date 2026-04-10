import { Injectable } from '@nestjs/common';
import { PackageTransactionRepository } from '@ai-media/share';

@Injectable()
export class PackageTransactionService {
  constructor(
    private readonly packageTransactionRepo: PackageTransactionRepository,
  ) {}

  findOne(id: string) {
    return this.packageTransactionRepo.findOne({
      where: { id },
    });
  }

  findByOrganizationId(organizationId: string) {
    return this.packageTransactionRepo.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
