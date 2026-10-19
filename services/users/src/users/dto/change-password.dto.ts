import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  newPassword: string;
}
