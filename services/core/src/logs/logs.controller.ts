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

  @Get(':projectId')
  findOne(@Param('projectId') projectId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,) {
    return this.logsService.findOne(projectId, +skip, +take);
  }
  @Get('find-vdo/:projectId')
  findOneVDO(
    @Param('projectId') projectId: string,
    @Query('skip') skip?: number,
    @Query('take') take?: number,
  ) {
    return this.logsService.findOneVDO(projectId, +skip, +take);
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
