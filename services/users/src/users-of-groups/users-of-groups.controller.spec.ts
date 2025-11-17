import { Test, TestingModule } from '@nestjs/testing';
import { UsersOfGroupsController } from './users-of-groups.controller';
import { UsersOfGroupsService } from './users-of-groups.service';

describe('UsersOfGroupsController', () => {
  let controller: UsersOfGroupsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersOfGroupsController],
      providers: [UsersOfGroupsService],
    }).compile();

    controller = module.get<UsersOfGroupsController>(UsersOfGroupsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
