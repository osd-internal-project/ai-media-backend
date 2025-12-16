import { Test, TestingModule } from '@nestjs/testing';
import { MasteradataConfigApiService } from './masteradata-config-api.service';

describe('MasteradataConfigApiService', () => {
  let service: MasteradataConfigApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MasteradataConfigApiService],
    }).compile();

    service = module.get<MasteradataConfigApiService>(MasteradataConfigApiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
