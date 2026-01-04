import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AcceptInvitationDto {
    @IsString()
    @IsNotEmpty()
    token: string;

    @IsOptional()
    @IsString()
    username?: string;

    @IsOptional()
    @IsString()
    password?: string;

    @IsOptional()
    @IsString()
    fullname?: string;

    @IsOptional()
    @IsString()
    phoneNumber?: string;
}
