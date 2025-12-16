import { Test, TestingModule } from '@nestjs/testing';
import { ProjectMemberController } from './project-member.controller';
import { ProjectMemberService } from './project-member.service';

describe('ProjectMemberController', () => {
  let controller: ProjectMemberController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectMemberController],
      providers: [ProjectMemberService],
    }).compile();

    controller = module.get<ProjectMemberController>(ProjectMemberController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
