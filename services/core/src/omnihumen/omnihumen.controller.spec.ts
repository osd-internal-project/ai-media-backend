import { Test, TestingModule } from '@nestjs/testing';
import { OmnihumenController } from './omnihumen.controller';
import { OmnihumenService } from './omnihumen.service';

describe('OmnihumenController', () => {
  let controller: OmnihumenController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OmnihumenController],
      providers: [OmnihumenService],
    }).compile();

    controller = module.get<OmnihumenController>(OmnihumenController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
