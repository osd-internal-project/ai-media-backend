import { IsInt, IsString } from 'class-validator';

export class CreateGenerationDto {
  @IsString()
  userId: string;

  @IsString()
  photoId: string;

  @IsInt()
  promptGuideId: number;
}
