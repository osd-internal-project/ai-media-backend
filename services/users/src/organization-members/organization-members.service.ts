import { Injectable } from '@nestjs/common';
import { CreateOrganizationMemberDto } from './dto/create-organization-members.dto';
import { UpdateOrganizationMemberDto } from './dto/update-organization-members.dto';
import { OrganizationMemberRepository } from '@ai-media/share';
import { UsersRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrganizationMembersService {
  constructor(
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private readonly usersRepo: UsersRepository,
  ) {}

  create(createOrganizationMembersDto: Prisma.OrganizationMemberCreateInput) {
    return this.organizationMemberRepo.create({
      data: createOrganizationMembersDto,
    });
  }
  createFromInvite(createOrganizationMembersDto: CreateOrganizationMemberDto) {
    return this.organizationMemberRepo.create({
      data: {
        ...createOrganizationMembersDto,
        role: 'MEMBER',
        maxImages: 10000,
        maxToken: 10000,
      },
    });
  }
  findAll() {
    return this.organizationMemberRepo.findMany({});
  }

  findOne(id: number) {
    return this.organizationMemberRepo.findOne({
      where: { id },
    });
  }

  findByOrganization(organizationId: string) {
    return this.organizationMemberRepo.findMany({
      where: { organizationId },
      include: { users: true },
      orderBy: { joinedAt: 'desc' },
    });
  }
  async findUserMemberByOrganization(organizationId: string, token: string) {
    const user = await this.usersRepo.findOne({
      where: { token },
    });
    return this.organizationMemberRepo.findOne({
      where: { organizationId, userId: user?.userId, status: 'active' },
    });
  }
  update(
    id: number,
    updateOrganizationMembersDto: UpdateOrganizationMemberDto,
  ) {
    return this.organizationMemberRepo.update({
      where: { id },
      data: updateOrganizationMembersDto,
    });
  }

  remove(id: number) {
    return this.organizationMemberRepo.delete({
      where: { id },
    });
  }
}
