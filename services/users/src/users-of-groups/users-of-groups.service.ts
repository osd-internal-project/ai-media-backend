import { Injectable } from '@nestjs/common';
import { CreateUsersOfGroupDto } from './dto/create-users-of-group.dto';
import { UpdateUsersOfGroupDto } from './dto/update-users-of-group.dto';

@Injectable()
export class UsersOfGroupsService {
  create(createUsersOfGroupDto: CreateUsersOfGroupDto) {
    return 'This action adds a new usersOfGroup';
  }

  findAll() {
    return `This action returns all usersOfGroups`;
  }

  findOne(id: number) {
    return `This action returns a #${id} usersOfGroup`;
  }

  update(id: number, updateUsersOfGroupDto: UpdateUsersOfGroupDto) {
    return `This action updates a #${id} usersOfGroup`;
  }

  remove(id: number) {
    return `This action removes a #${id} usersOfGroup`;
  }
}
