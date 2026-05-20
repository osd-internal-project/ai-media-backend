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
import { OrganizationService } from './organization.service';
import { ApproveInviteUserDto } from './dto/approve-invite-user.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { Prisma } from '@prisma/client';

@Controller('organization')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  create(@Body() createOrganizationDto: Prisma.OrganizationCreateInput) {
    return this.organizationService.create(createOrganizationDto);
  }

  @Post('owner')
  createOwner(@Body() createOrganizationDto: Prisma.OrganizationCreateInput) {
    return this.organizationService.createOwner(createOrganizationDto);
  }
  @Post('system-admin')
  createBySystemAdmin(
    @Body()
    createOrganizationDto: {
      name: string;
      description: string;
      planId: string;
      priceId: string;
      type: string;
      createdById: string;
      slug: string;
    },
  ) {
    return this.organizationService.createBySystemAdmin(createOrganizationDto);
  }
  @Post('invitation')
  createInvitation(@Body() createInvitationDto: CreateInvitationDto) {
    return this.organizationService.createInvitation(createInvitationDto);
  }
@Get('invitation/organization/:organizationId')
  findInvitationsByOrganizationId(@Param('organizationId') organizationId: string) {
    return this.organizationService.findInvitationsByOrganizationId(organizationId);
  }
  @Get('invitation/:token')
  verifyInvitation(@Param('token') token: string) {
    return this.organizationService.verifyInvitation(token);
  }

  @Post('invitation/accept')
  acceptInvitation(@Body() acceptInvitationDto: AcceptInvitationDto) {
    return this.organizationService.acceptInvitation(acceptInvitationDto);
  }
  @Get('access-code/:organizationId')
  findAccessCodeByOrganizationId(
    @Param('organizationId') organizationId: string,
  ) {
    return this.organizationService.findAccessCodeByOrganizationId(
      organizationId,
    );
  }

  @Get()
  findAll(@Query() search: { searchText?: string; type?: string }) {
    return this.organizationService.findAll(search);
  }

  @Get('user/:id')
  findManyByUserId(
    @Param('id') userId: string,
    @Query() search: { type: string },
  ) {
    return this.organizationService.findManyByUserId(userId, search);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateOrganizationDto: Prisma.OrganizationUpdateInput,
  ) {
    return this.organizationService.update(id, updateOrganizationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.organizationService.remove(id);
  }
}
