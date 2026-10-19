import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
} from 'class-validator';
import { BULK_MAX_ROWS } from './bulk-add-members.dto';

export const MEMBER_STATUSES = ['active', 'inactive'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** organization_member.id ที่เลือกในตาราง Member */
export class BulkMemberIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MAX_ROWS)
  @IsInt({ each: true })
  memberIds: number[];
}

export class BulkMemberStatusDto extends BulkMemberIdsDto {
  @IsIn(MEMBER_STATUSES)
  status: MemberStatus;
}
