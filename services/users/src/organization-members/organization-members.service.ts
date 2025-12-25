import { Injectable } from '@nestjs/common';
import { CreateOrganizationMemberDto } from './dto/create-organization-members.dto';
import { UpdateOrganizationMemberDto } from './dto/update-organization-members.dto';
import { OrganizationMemberRepository } from '@ai-media/share';

@Injectable()
export class OrganizationMembersService {
  constructor(
    private readonly organizationMemberRepo: OrganizationMemberRepository,
  ) {}

  create(createOrganizationMembersDto: CreateOrganizationMemberDto) {
    return this.organizationMemberRepo.create({
      data: createOrganizationMembersDto,
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
