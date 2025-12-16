import { Test, TestingModule } from '@nestjs/testing';
import { MasteradataConfigApiController } from './masteradata-config-api.controller';
import { MasteradataConfigApiService } from './masteradata-config-api.service';

describe('MasteradataConfigApiController', () => {
  let controller: MasteradataConfigApiController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MasteradataConfigApiController],
      providers: [MasteradataConfigApiService],
    }).compile();

    controller = module.get<MasteradataConfigApiController>(MasteradataConfigApiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
