import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { LogsService } from './logs.service';

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('find-image/:projectId')
  findProjectImageByPage(
    @Param('projectId') projectId: string,
    @Query('organizationId') organizationId: string,
    @Query('userId') userId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.logsService.findProjectImageByPage(
      projectId,
      organizationId,
      userId,
      +skip,
      +take,
    );
  }
  // @Get('find-image/:projectId/frist')
  // findProjectImageByFristId(
  //   @Param('projectId') projectId: string,
  //   @Query('organizationId') organizationId: string,
  //   @Query('fristid') fristId: string,
  // ) {
  //   return this.logsService.findProjectImageByFristId(
  //     projectId,
  //     organizationId,
  //     fristId,
  //   );
  // }
  @Get('find-vdo/:projectId')
  findProjectVideoByPage(
    @Param('projectId') projectId: string,
    @Query('organizationId') organizationId: string,
    @Query('userId') userId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.logsService.findProjectVideoByPage(
      projectId,
      organizationId,
      userId, 
      +skip,
      +take,
    );
  }
  @Get('find-vdo/:projectId/frist')
  findProjectViedoByFristId(
    @Param('projectId') projectId: string,
    @Query('organizationId') organizationId: string,
    @Query('fristid') fristId: string,
  ) {
    return this.logsService.findProjectViedoByFristId(
      projectId,
      organizationId,
      fristId,
    );
  }
  @Get('find-product-task/:projectId')
  async findProjectTaskByPage(
    @Param('projectId') projectId: string,
    @Query('organizationId') organizationId: string,
    @Query('userId') userId: string,
    @Query('skip') skip: number,
    @Query('take') take: number,
    @Query('type') type: 'image' | 'video' | 'omnihumen' | 'dreamactor' | 'audio',
    @Query('fristsql') fristsql: number,
    @Query('lastsql') lastsql: number,
  ) {
    const numSkip = skip != null ? +skip : undefined;
    const numTake = take != null ? +take : undefined;
    const numFrist = fristsql != null ? +fristsql : undefined;
    const numLast = lastsql != null ? +lastsql : undefined;

    const conversation =
        type === 'image'
          ? await this.logsService.findProjectImageByPage(
              projectId,
              organizationId,
              userId,
              numSkip,
              numTake,
              numFrist,
              numLast,
            )
          : type === 'video'
          ? await this.logsService.findProjectVideoByPage(
              projectId,
              organizationId,
              userId,
              numSkip,
              numTake,
              numFrist,
              numLast,
            )
          : type === 'omnihumen'
          ? await this.logsService.findProjectOmniHumenByPage(
              projectId,
              organizationId,
              userId,
              numSkip,
              numTake,
              numFrist,
              numLast,
            )
          : type === 'dreamactor'
          ? await this.logsService.findProjectDreamactorByPage(
              projectId,
              organizationId,
              userId,
              numSkip,
              numTake,
              numFrist,
              numLast,
            )
          : type === 'audio'
          ? await this.logsService.findProjectAudioByPage(
              projectId,
              organizationId,
              userId,
              numSkip,
              numTake,
              numFrist,
              numLast,
            )
          : [];

    return conversation;
  }

  @Get('detail/:logId')
  findDetail(
    @Param('logId') logId: string,
    @Query('organizationId') organizationId: string,
  ) {
    return this.logsService.findDetail(logId, organizationId);
  }

  @Get('generate-vdo-logs/:taskId')
  findByTaskId(@Param('taskId') taskId: string, @Query() query: any) {
    return this.logsService.findByTaskId(taskId, query);
  }
  @Get('by-userid/:userId')
  findByUserId(
    @Param('userId') userId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.logsService.findByUserId(userId, +skip, +take);
  }
}
