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
import { query } from 'express';

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
    @Query() query: { name?: string; token: string },
  ) {
    return this.projectService.findByOrganizationId(organizationId, query);
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
  @Delete(':id/remove')
  deleteProject(@Param('id') id: string) {
    return this.projectService.deleteProject(id);
  }
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectService.remove(id);
  }

  @Get(':projectId/members')
  getProjectMembers(@Param('projectId') projectId: string) {
    return this.projectService.getProjectMembers(projectId);
  }

  @Get(':projectId/role/:userId')
  getUserRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    return this.projectService.checkUserRole(projectId, userId);
  }

  @Get(':projectId/admin/:userId')
  isProjectAdmin(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    return this.projectService.isProjectAdmin(projectId, userId);
  }

  @Get(':projectId/permission/:userId')
  hasProjectPermission(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Query('requiredRole') requiredRole?: string,
  ) {
    return this.projectService.hasProjectPermission(
      projectId,
      userId,
      requiredRole as any,
    );
  }
}
