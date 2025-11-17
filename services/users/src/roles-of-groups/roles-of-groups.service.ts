import { Injectable } from '@nestjs/common';
import { CreateRolesOfGroupDto } from './dto/create-roles-of-group.dto';
import { UpdateRolesOfGroupDto } from './dto/update-roles-of-group.dto';

@Injectable()
export class RolesOfGroupsService {
  create(createRolesOfGroupDto: CreateRolesOfGroupDto) {
    return 'This action adds a new rolesOfGroup';
  }

  findAll() {
    return `This action returns all rolesOfGroups`;
  }

  findOne(id: number) {
    return `This action returns a #${id} rolesOfGroup`;
  }

  update(id: number, updateRolesOfGroupDto: UpdateRolesOfGroupDto) {
    return `This action updates a #${id} rolesOfGroup`;
  }

  remove(id: number) {
    return `This action removes a #${id} rolesOfGroup`;
  }
}
