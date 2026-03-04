import { Injectable } from '@nestjs/common';
import { CreditBalanceRepository } from '@ai-media/share';

@Injectable()
export class CreditBalanceService {
  constructor(
    private readonly creditBalanceRepo: CreditBalanceRepository,
  ) {}

  findOne(id: string) {
    return this.creditBalanceRepo.findOne({
      where: { id },
    });
  }

  findByOrganizationId(organizationId: string) {
    return this.creditBalanceRepo.findOne({
      where: { organizationId },
    });
  }

  async updateExtraCoin(
    organizationId: string,
    data: { onTopBalance?: number; onTopImage?: number },
  ) {
    const creditBalance = await this.findByOrganizationId(organizationId);
    if (!creditBalance) {
      throw new Error('Credit balance not found');
    }
    return this.creditBalanceRepo.update({
      where: { id: creditBalance.id },
      data: {
        onTopBalance: { increment: data.onTopBalance || 0 },
        onTopImage: { increment: data.onTopImage || 0 },
      },
    });
  }
}
