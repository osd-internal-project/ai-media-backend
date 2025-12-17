import { PartialType } from '@nestjs/swagger';
import { CreateOmnihumanDto } from './create-omnihuman.dto';

export class UpdateOmnihumanDto extends PartialType(CreateOmnihumanDto) {}
