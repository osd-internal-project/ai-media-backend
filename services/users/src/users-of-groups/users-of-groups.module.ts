import { Module } from '@nestjs/common';
import { UsersOfGroupsService } from './users-of-groups.service';
import { UsersOfGroupsController } from './users-of-groups.controller';

@Module({
  controllers: [UsersOfGroupsController],
  providers: [UsersOfGroupsService]
})
export class UsersOfGroupsModule {}
