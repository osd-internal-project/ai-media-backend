import { PartialType } from '@nestjs/swagger';
import { CreateBillingProfileDto } from './create-billing-profile.dto';

export class UpdateBillingProfileDto extends PartialType(
  CreateBillingProfileDto,
) {}
