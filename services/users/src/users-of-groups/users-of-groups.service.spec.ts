import { Test, TestingModule } from '@nestjs/testing';
import { UsersOfGroupsService } from './users-of-groups.service';

describe('UsersOfGroupsService', () => {
  let service: UsersOfGroupsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersOfGroupsService],
    }).compile();

    service = module.get<UsersOfGroupsService>(UsersOfGroupsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
