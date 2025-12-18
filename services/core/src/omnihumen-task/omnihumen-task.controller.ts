import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { OmnihumenTaskService } from './omnihumen-task.service';
import { CreateOmnihumenTaskDto } from './dto/create-omnihumen-task.dto';
import { UpdateOmnihumenTaskDto } from './dto/update-omnihumen-task.dto';

@Controller('omnihumen-task')
export class OmnihumenTaskController {
  constructor(private readonly omnihumenTaskService: OmnihumenTaskService) {}

  @Post()
  create(@Body() createOmnihumenTaskDto: CreateOmnihumenTaskDto) {
    return this.omnihumenTaskService.create(createOmnihumenTaskDto);
  }

  @Get()
  findAll() {
    return this.omnihumenTaskService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.omnihumenTaskService.findOne(+id);
  }

  @Get('project/:projectId')
  findByProjectId(@Param('projectId') projectId: string) {
    return this.omnihumenTaskService.findByProjectId(projectId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOmnihumenTaskDto: UpdateOmnihumenTaskDto,
  ) {
    return this.omnihumenTaskService.update(+id, updateOmnihumenTaskDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.omnihumenTaskService.remove(+id);
  }
}
