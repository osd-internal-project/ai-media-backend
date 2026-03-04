import { Injectable } from '@nestjs/common';
import { OrganizationSubscriptionRepository } from '@ai-media/share';

@Injectable()
export class OrganizationSubscriptionService {
  constructor(
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
  ) {}

  findOne(id: string) {
    return this.organizationSubscriptionRepo.findOne({
      where: { id },
    });
  }

  findByOrganizationId(organizationId: string) {
    return this.organizationSubscriptionRepo.findOne({
      where: { organizationId },
    });
  }
}
