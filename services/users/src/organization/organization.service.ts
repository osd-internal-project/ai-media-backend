import { Injectable } from '@nestjs/common';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import {
  OrganizationMemberRepository,
  OrganizationRepository,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepo: OrganizationRepository,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
  ) {}

  create(createOrganizationDto: Prisma.OrganizationCreateInput) {
    return this.organizationRepo.create({
      data: createOrganizationDto,
    });
  }
  async createOwner(createOrganizationDto: Prisma.OrganizationCreateInput) {
    const data = await this.organizationRepo.create({
      data: createOrganizationDto,
    });
    if (data) {
      await this.organizationMemberRepo.create({
        data: {
          organizationId: data.organizationId,
          userId: createOrganizationDto.createdById,
          role: 'OWNER',
          maxImages: 1000000, //fix token
          maxToken: 1000000, //fix token
        },
      });
    }
    return data;
  }
  findAll() {
    return this.organizationRepo.findMany({});
  }
  findManyByUserId(userId: string, search: { type: string }) {
    console.log(userId);
    return this.organizationRepo.findMany({
      where: {
        type: search.type,
        OR: [
          { organizationMember: { some: { userId } } },
          { createdById: userId },
        ],
      },
    });
  }
  findOne(id: string) {
    return this.organizationRepo.findOne({
      where: { organizationId: id },
    });
  }

  update(id: string, updateOrganizationDto: Prisma.OrganizationUpdateInput) {
    return this.organizationRepo.update({
      where: { organizationId: id },
      data: updateOrganizationDto,
    });
  }

  remove(id: string) {
    return this.organizationRepo.delete({
      where: { organizationId: id },
    });
  }
}
