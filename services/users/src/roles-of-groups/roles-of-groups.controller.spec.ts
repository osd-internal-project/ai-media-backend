import { Test, TestingModule } from '@nestjs/testing';
import { RolesOfGroupsController } from './roles-of-groups.controller';
import { RolesOfGroupsService } from './roles-of-groups.service';

describe('RolesOfGroupsController', () => {
  let controller: RolesOfGroupsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesOfGroupsController],
      providers: [RolesOfGroupsService],
    }).compile();

    controller = module.get<RolesOfGroupsController>(RolesOfGroupsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
