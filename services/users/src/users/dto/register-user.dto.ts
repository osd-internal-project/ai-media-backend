import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterUserDto {
    @IsEmail()
    @IsNotEmpty()
    @ApiProperty({
        example: 'user@example.com',
        required: true,
    })
    email: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        example: 'John Doe',
        required: true,
    })
    fullname: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        example: 'johndoe',
        required: true,
    })
    username: string;

    @IsString()
    @IsNotEmpty()
    @Length(6, 20)
    @ApiProperty({
        example: 'password123',
        required: true,
    })
    password: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        example: '0812345678',
        required: true,
    })
    phoneNumber: string;
}
