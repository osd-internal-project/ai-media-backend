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
  constructor(private readonly logsService: LogsService) {}

  @Get(':projectId')
  findOne(@Param('projectId') projectId: string) {
    return this.logsService.findOne(projectId);
  }
  @Get('find-vdo/:projectId')
  findOneVDO(@Param('projectId') projectId: string) {
    return this.logsService.findOneVDO(projectId);
  }

  @Get('generate-vdo-logs/:taskId')
  findByTaskId(@Param('taskId') taskId: string, @Query() query: any) {
    return this.logsService.findByTaskId(taskId, query);
  }
}
