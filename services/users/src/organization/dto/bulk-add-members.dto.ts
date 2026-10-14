import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const BULK_MAX_ROWS = 1000;
export const BULK_CHUNK_SIZE = 50;

/**
 * หนึ่งแถวในตาราง import — DTO ตรวจแค่ชนิด/ความยาว ส่วนรูปแบบ (email, role, required)
 * ตรวจใน service เพื่อให้แถวที่ผิดได้ error รายแถว ไม่ใช่ทั้ง request ถูกปฏิเสธ
 */
export class BulkMemberRowDto {
  @IsOptional() @IsString() @MaxLength(100) username?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(255) fullname?: string;
  @IsOptional() @IsString() @MaxLength(255) password?: string;
  @IsOptional() @IsString() @MaxLength(50) phoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(50) role?: string;
  @IsOptional() @IsString() @MaxLength(50) projectId?: string;
  @IsOptional() @IsString() @MaxLength(255) projectName?: string;
  @IsOptional() @IsString() @MaxLength(50) projectRole?: string;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false })
  credit?: number;
}

export class BulkAddMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => BulkMemberRowDto)
  rows: BulkMemberRowDto[];
}

export class BulkChunkRowDto extends BulkMemberRowDto {
  @IsInt() @Min(0) rowIndex: number;
}

export class BulkNewProjectDto {
  @IsString() @MaxLength(255) name: string;
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  limitCreditAllowance: number;
}

export class BulkCreateChunkDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_CHUNK_SIZE)
  @ValidateNested({ each: true })
  @Type(() => BulkChunkRowDto)
  rows: BulkChunkRowDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkNewProjectDto)
  newProjects: BulkNewProjectDto[];
}
