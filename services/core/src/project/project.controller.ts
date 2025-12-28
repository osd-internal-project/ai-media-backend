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
import { ProjectService } from './project.service';
import { Prisma } from '@prisma/client';

@Controller('project')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  create(@Body('body') createProjectDto: Prisma.ProjectCreateInput) {
    return this.projectService.create(createProjectDto);
  }

  @Get()
  findAll() {
    return this.projectService.findAll();
  }

  @Get('organization/:organizationId')
  findByOrganizationId(
    @Param('organizationId') organizationId: string,
    @Query('token') token: string,
  ) {
    return this.projectService.findByOrganizationId(organizationId, token);
  }

  @Get('manage/:id')
  findManageRoles(@Param('id') id: string) {
    return this.projectService.findById(id);
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectService.findOne(id);
  }
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateProjectDto: Prisma.ProjectUpdateInput,
  ) {
    return this.projectService.update(id, updateProjectDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectService.remove(id);
  }
}
