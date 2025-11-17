import { Module } from '@nestjs/common';
import { RolesOfGroupsService } from './roles-of-groups.service';
import { RolesOfGroupsController } from './roles-of-groups.controller';

@Module({
  controllers: [RolesOfGroupsController],
  providers: [RolesOfGroupsService]
})
export class RolesOfGroupsModule {}
