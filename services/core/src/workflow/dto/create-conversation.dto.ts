import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body สำหรับสร้าง WorkflowConversation ใหม่
 * ต้องใส่ decorator เพราะ global ValidationPipe เปิด whitelist:true
 * (property ที่ไม่มี decorator จะถูกตัดทิ้ง)
 */
export class CreateConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
