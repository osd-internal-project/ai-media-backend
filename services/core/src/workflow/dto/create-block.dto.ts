import {
  Allow,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * Body สำหรับสร้าง WorkflowBlock ใหม่ภายใน conversation
 *
 * generateConfig คือ payload เต็มแบบเดียวกับที่ฟอร์ม Gen Image / Gen Video เดิมส่ง
 * (RequestImageGenerateDto / RequestVideoGenerateDto) — เก็บไว้ทั้งก้อนเพื่อส่งต่อให้
 * GenerateService เดิมโดยไม่ต้องประกอบใหม่ จึงรับเป็น object แบบ passthrough
 */
export class CreateBlockDto {
  @IsIn(['image', 'video'])
  type: 'image' | 'video';

  @IsString()
  prompt: string;

  @IsString()
  model: string;

  @IsString()
  resolution: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parentBlockIds?: string[];

  @IsNumber()
  positionX: number;

  @IsNumber()
  positionY: number;

  // ส่งต่อทั้งก้อนให้ pipeline เดิม — ไม่ validate ภายในเพื่อคงทุก field ของฟอร์มเดิม
  @IsObject()
  @Allow()
  generateConfig: Record<string, unknown>;
}
