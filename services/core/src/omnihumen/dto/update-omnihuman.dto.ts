import { PartialType } from '@nestjs/swagger';
import { CreateOmnihumenDto } from './create-omnihumen.dto';

export class UpdateOmnihumenDto extends PartialType(CreateOmnihumenDto) {}
