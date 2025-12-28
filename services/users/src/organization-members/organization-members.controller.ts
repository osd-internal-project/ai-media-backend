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
import { OrganizationMembersService } from './organization-members.service';
import { CreateOrganizationMemberDto } from './dto/create-organization-members.dto';
import { UpdateOrganizationMemberDto } from './dto/update-organization-members.dto';

@Controller('organization-members')
export class OrganizationMembersController {
  constructor(
    private readonly organizationMembersService: OrganizationMembersService,
  ) {}

  @Post()
  create(@Body() createOrganizationMembersDto: CreateOrganizationMemberDto) {
    return this.organizationMembersService.create(createOrganizationMembersDto);
  }

  @Get()
  findAll() {
    return this.organizationMembersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationMembersService.findOne(+id);
  }

  @Get('organization/:organizationId')
  findByOrganization(@Param('organizationId') organizationId: string) {
    return this.organizationMembersService.findByOrganization(organizationId);
  }
  @Get('organization/:organizationId/user')
  findUserMemberByOrganization(
    @Param('organizationId') organizationId: string,
    @Query('token') token: string,
  ) {
    return this.organizationMembersService.findUserMemberByOrganization(
      organizationId,
      token,
    );
  }
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrganizationMembersDto: UpdateOrganizationMemberDto,
  ) {
    return this.organizationMembersService.update(
      +id,
      updateOrganizationMembersDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationMembersService.remove(+id);
  }
}
