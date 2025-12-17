import { PartialType } from '@nestjs/mapped-types';
import { CreateOmnihumenTaskDto } from './create-omnihumen-task.dto';

export class UpdateOmnihumenTaskDto extends PartialType(
  CreateOmnihumenTaskDto,
) {}
