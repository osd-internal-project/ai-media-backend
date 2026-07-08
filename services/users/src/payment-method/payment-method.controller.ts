import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { PaymentMethodService } from './payment-method.service';

/** Saved-card management for an organization (Omise customer cards). */
@Controller('payment-method')
export class PaymentMethodController {
  constructor(private readonly paymentMethodService: PaymentMethodService) {}

  @Get(':organizationId/cards')
  listCards(@Param('organizationId') organizationId: string) {
    return this.paymentMethodService.listCards(organizationId);
  }

  @Post(':organizationId/cards')
  addCard(
    @Param('organizationId') organizationId: string,
    @Body() body: { token: string },
  ) {
    return this.paymentMethodService.addCard(organizationId, body.token);
  }

  @Delete(':organizationId/cards/:cardId')
  deleteCard(
    @Param('organizationId') organizationId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.paymentMethodService.deleteCard(organizationId, cardId);
  }
}
