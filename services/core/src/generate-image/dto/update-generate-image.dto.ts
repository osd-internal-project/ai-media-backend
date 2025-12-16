import { PartialType } from '@nestjs/swagger';
import { CreateGenerateImageDto } from './create-generate-image.dto';

export class UpdateGenerateImageDto extends PartialType(
  CreateGenerateImageDto,
) {}
