import { PartialType } from '@nestjs/swagger';
import { CreatePromptGuideDto } from './create-prompt-guide.dto';

export class UpdatePromptGuideDto extends PartialType(CreatePromptGuideDto) {}
