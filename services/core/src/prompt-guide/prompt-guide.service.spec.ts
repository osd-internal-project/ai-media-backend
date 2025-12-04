import { Test, TestingModule } from '@nestjs/testing';
import { PromptGuideService } from './prompt-guide.service';

describe('PromptGuideService', () => {
  let service: PromptGuideService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PromptGuideService],
    }).compile();

    service = module.get<PromptGuideService>(PromptGuideService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
