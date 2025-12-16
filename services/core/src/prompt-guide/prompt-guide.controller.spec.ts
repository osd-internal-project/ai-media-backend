import { Test, TestingModule } from '@nestjs/testing';
import { PromptGuideController } from './prompt-guide.controller';
import { PromptGuideService } from './prompt-guide.service';

describe('PromptGuideController', () => {
  let controller: PromptGuideController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromptGuideController],
      providers: [PromptGuideService],
    }).compile();

    controller = module.get<PromptGuideController>(PromptGuideController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
