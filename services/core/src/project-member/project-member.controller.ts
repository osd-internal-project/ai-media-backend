import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProjectMemberService } from './project-member.service';
import { CreateProjectMemberDto } from './dto/create-project-member.dto';
import { UpdateProjectMemberDto } from './dto/update-project-member.dto';

@Controller('project-member')
export class ProjectMemberController {
  constructor(private readonly projectMemberService: ProjectMemberService) {}

  @Post()
  create(@Body() createProjectMemberDto: CreateProjectMemberDto) {
    return this.projectMemberService.create(createProjectMemberDto);
  }

  @Get()
  findAll() {
    return this.projectMemberService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectMemberService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProjectMemberDto: UpdateProjectMemberDto) {
    return this.projectMemberService.update(+id, updateProjectMemberDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectMemberService.remove(+id);
  }
}
