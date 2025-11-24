import { PartialType } from '@nestjs/swagger';
import { CreateMasteradataConfigApiDto } from './create-masteradata-config-api.dto';

export class UpdateMasteradataConfigApiDto extends PartialType(CreateMasteradataConfigApiDto) {}
