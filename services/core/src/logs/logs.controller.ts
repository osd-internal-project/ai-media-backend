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
import { CreateLogDto } from './dto/create-log.dto';
import { UpdateLogDto } from './dto/update-log.dto';

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) { }

  @Get('find-image/:projectId')
  findProjectImageByPage(
    @Param('projectId') projectId: string,
    @Query('organizationId') organizationId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.logsService.findProjectImageByPage(projectId, organizationId, +skip, +take);
  }
  @Get('find-image/:projectId/frist')
  findProjectImageByFristId(
    @Param('projectId') projectId: string,
    @Query('organizationId') organizationId: string,
    @Query('fristid') fristId: string,
  ) {
    return this.logsService.findProjectImageByFristId(projectId, organizationId, fristId);
  }
  @Get('find-vdo/:projectId')
  findProjectVideoByPage(
    @Param('projectId') projectId: string,
    @Query('organizationId') organizationId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.logsService.findProjectVideoByPage(projectId, organizationId, +skip, +take);
  }
  @Get('find-vdo/:projectId/frist')
  findProjectViedoByFristId(
    @Param('projectId') projectId: string,
    @Query('organizationId') organizationId: string,
    @Query('fristid') fristId: string,
  ) {
    return this.logsService.findProjectViedoByFristId(projectId, organizationId, fristId);
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
