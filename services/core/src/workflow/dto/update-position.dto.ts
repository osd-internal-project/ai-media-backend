import { IsNumber } from 'class-validator';

/**
 * Body สำหรับอัปเดตตำแหน่งของบล็อกบนแคนวาส (ลากแล้วบันทึก)
 */
export class UpdatePositionDto {
  @IsNumber()
  positionX: number;

  @IsNumber()
  positionY: number;
}
