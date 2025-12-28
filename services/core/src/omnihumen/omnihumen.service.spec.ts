import { Test, TestingModule } from '@nestjs/testing';
import { OmnihumenService } from './omnihumen.service';

describe('OmnihumenService', () => {
  let service: OmnihumenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OmnihumenService],
    }).compile();

    service = module.get<OmnihumenService>(OmnihumenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
