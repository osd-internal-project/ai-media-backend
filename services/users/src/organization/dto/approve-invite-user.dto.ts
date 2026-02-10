import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class ApproveInviteUserDto {
    @IsString()
    organizationId: string;

    @IsString()
    userId: string;

    @IsOptional()
    @IsString()
    role?: string;

    @IsOptional()
    @IsNumber()
    maxToken?: number;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    projectIds?: string[];

    @IsOptional()
    @IsString()
    projectRole?: string;
}
