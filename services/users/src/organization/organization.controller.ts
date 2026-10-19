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
import { AuthUser, CurrentUser } from '@ai-media/share';
import { OrganizationBulkMemberService } from './organization-bulk-member.service';
import {
  BulkAddMembersDto,
  BulkCreateChunkDto,
} from './dto/bulk-add-members.dto';
import {
  BulkMemberIdsDto,
  BulkMemberStatusDto,
} from './dto/bulk-member-actions.dto';

@Controller('organization')
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly bulkMemberService: OrganizationBulkMemberService,
  ) {}

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
  @Get('invitation/pending')
  findPendingInvitations(@Query('email') email: string) {
    return this.organizationService.findPendingInvitations(email);
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
  @Get(':organizationId/bulk-members/projects')
  findBulkMemberProjects(
    @Param('organizationId') organizationId: string,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    return this.bulkMemberService.listProjects(organizationId, authUser);
  }

  @Post(':organizationId/bulk-members/validate')
  validateBulkMembers(
    @Param('organizationId') organizationId: string,
    @Body() dto: BulkAddMembersDto,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    return this.bulkMemberService.validate(organizationId, dto, authUser);
  }

  @Post(':organizationId/bulk-members')
  createBulkMembers(
    @Param('organizationId') organizationId: string,
    @Body() dto: BulkCreateChunkDto,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    return this.bulkMemberService.createChunk(organizationId, dto, authUser);
  }

  @Post(':organizationId/bulk-members/remove')
  removeBulkMembers(
    @Param('organizationId') organizationId: string,
    @Body() dto: BulkMemberIdsDto,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    return this.bulkMemberService.removeMembers(
      organizationId,
      dto.memberIds,
      authUser,
    );
  }

  @Post(':organizationId/bulk-members/status')
  setBulkMembersStatus(
    @Param('organizationId') organizationId: string,
    @Body() dto: BulkMemberStatusDto,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    return this.bulkMemberService.setMembersStatus(
      organizationId,
      dto.memberIds,
      dto.status,
      authUser,
    );
  }

  @Post(':organizationId/bulk-members/send-access-email')
  sendBulkAccessEmails(
    @Param('organizationId') organizationId: string,
    @Body() dto: BulkMemberIdsDto,
    @CurrentUser() authUser: AuthUser | undefined,
  ) {
    return this.bulkMemberService.sendAccessEmails(
      organizationId,
      dto.memberIds,
      authUser,
    );
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
