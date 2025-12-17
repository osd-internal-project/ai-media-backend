import { PartialType } from '@nestjs/mapped-types';
import { CreatePromptGuideTypeDto } from './create-prompt-guide-type.dto';

export class UpdatePromptGuideTypeDto extends PartialType(
  CreatePromptGuideTypeDto,
) {}
