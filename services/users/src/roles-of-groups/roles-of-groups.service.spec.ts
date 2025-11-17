import { Test, TestingModule } from '@nestjs/testing';
import { RolesOfGroupsService } from './roles-of-groups.service';

describe('RolesOfGroupsService', () => {
  let service: RolesOfGroupsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesOfGroupsService],
    }).compile();

    service = module.get<RolesOfGroupsService>(RolesOfGroupsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
