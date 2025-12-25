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

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body('body') createUserDto: Prisma.usersCreateInput) {
    return this.usersService.create(createUserDto);
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
  @Patch('detail/:userId')
  updateDetail(
    @Param('userId') userId: string,
    @Body('body') updateUserDto: Prisma.usersUpdateInput,
  ) {
    console.log(updateUserDto);
    return this.usersService.updateDetail(userId, updateUserDto);
  }
  @Delete(':userId')
  remove(@Param('userId') userId: string) {
    return this.usersService.remove(userId);
  }
}
