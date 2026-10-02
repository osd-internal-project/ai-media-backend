import { IsEmail } from 'class-validator';

export class NotifyInvitationDto {
  @IsEmail()
  email: string;
}
