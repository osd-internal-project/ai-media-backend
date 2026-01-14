import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Prisma } from '@prisma/client';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  create(@Body('body') createUserDto: Prisma.usersCreateInput) {
    return this.usersService.create(createUserDto);
  }

  @Post('register')
  register(@Body() registerUserDto: RegisterUserDto) {
    return this.usersService.register(registerUserDto);
  }

  @Post('verify-email/:token')
  verifyEmail(@Param('token') token: string, @Body('password') password: string) {
    return this.usersService.verifyEmail(token, password);
  }

  @Post('request-change-password')
  requestChangePassword(@Body('email') email: string) {
    return this.usersService.requestChangePassword(email);
  }

  @Post('check-reset-password')
  checkResetPassword(@Body('token') token: string) {
    return this.usersService.checkResetPassword(token);
  }

  @Post('confirm-change-password')
  confirmChangePassword(@Body() body: any) {
    return this.usersService.confirmChangePassword(body);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('summary')
  summaryData() {
    return this.usersService.summaryData();
  }

  @Get('search')
  findBySearch(@Query('search') search?: string) {
    return this.usersService.findBySearch(search);
  }

  @Get('/detail/:token')
  findDetailByToken(@Param('token') token: string) {
    return this.usersService.findDetailByToken(token);
  }

  @Get('/organization/:organizationId')
  findOrganizationUserDetails(@Param('organizationId') organizationId: string) {
    return this.usersService.findOrganizationUserDetails(organizationId);
  }

  @Get('/verify-email/check/:token')
  checkVerifyEmail(@Param('token') token: string) {
    return this.usersService.checkVerifyEmail(token);
  }



  @Get(':userId')
  findOne(@Param('userId') userId: string) {
    return this.usersService.findOne(userId);
  }

  @Patch(':userId')
  update(
    @Param('userId') userId: string,
    @Body('body') updateUserDto: Prisma.usersUpdateInput,
  ) {
    return this.usersService.update(userId, updateUserDto);
  }

  @Patch('detail/:token')
  updateDetailByToken(
    @Param('token') token: string,
    @Body('body') updateUserDto: Prisma.usersUpdateInput,
  ) {
    console.log(updateUserDto);
    return this.usersService.updateDetailByToken(token, updateUserDto);
  }

  @Delete(':userId')
  remove(@Param('userId') userId: string) {
    return this.usersService.remove(userId);
  }
}
