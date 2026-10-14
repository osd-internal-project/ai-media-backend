import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@ai-media/share';
import { OmiseService, OmiseCard } from '../omise/omise.service';

/**
 * Manages an organization's saved payment cards, backed by a single Omise
 * Customer per organization (`organization.omiseCustomerId`). The customer is
 * created lazily on the first "add card" and reused thereafter.
 */
@Injectable()
export class PaymentMethodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly omiseService: OmiseService,
  ) {}

  /** Load the org or throw. */
  private async getOrg(organizationId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  /** List the organization's saved cards ([] if no customer yet). */
  async listCards(organizationId: string): Promise<OmiseCard[]> {
    const org = await this.getOrg(organizationId);
    if (!org.omiseCustomerId) return [];
    return this.omiseService.listCards(org.omiseCustomerId);
  }

  /**
   * Add a card (single-use Omise token) to the org. Creates the Omise customer
   * on first use and stores its id on the org. Returns the updated card list.
   */
  async addCard(organizationId: string, token: string): Promise<OmiseCard[]> {
    const org = await this.getOrg(organizationId);
    let customerId = org.omiseCustomerId;
    if (!customerId) {
      const customer = await this.omiseService.createCustomer({
        cardToken: token,
        description: `org:${organizationId}`,
      });
      customerId = customer.id;
      await this.prisma.organization.update({
        where: { organizationId },
        data: { omiseCustomerId: customerId },
      });
    } else {
      await this.omiseService.addCard(customerId, token);
    }
    return this.omiseService.listCards(customerId);
  }

  /** Delete a saved card from the organization's Omise customer. */
  async deleteCard(organizationId: string, cardId: string): Promise<OmiseCard[]> {
    const org = await this.getOrg(organizationId);
    if (!org.omiseCustomerId) {
      throw new NotFoundException('No saved cards for this organization');
    }
    await this.omiseService.deleteCard(org.omiseCustomerId, cardId);
    return this.omiseService.listCards(org.omiseCustomerId);
  }
}
