import { PartialType } from '@nestjs/swagger';
import { CreateMasterModelTypeDto } from './create-master-model-type.dto';

export class UpdateMasterModelTypeDto extends PartialType(CreateMasterModelTypeDto) {}
