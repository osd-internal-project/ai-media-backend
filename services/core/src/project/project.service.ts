import { Injectable } from '@nestjs/common';
import {
  ProjectRepository,
  UsersRepository,
  ProjectMemberRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';

interface ProjectMemberInput {
  userId: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  maxToken?: number;
  maxImages?: number;
}

// Role validation and hierarchy utilities
const PROJECT_ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER',
  VIEWER: 'VIEWER',
} as const;

const ORGANIZATION_ROLES = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

type ProjectRole = keyof typeof PROJECT_ROLES;
type OrganizationRole = keyof typeof ORGANIZATION_ROLES;

function isValidRole(role: string): role is ProjectRole {
  return Object.values(PROJECT_ROLES).includes(role as ProjectRole);
}

function isValidOrganizationRole(role: string): role is OrganizationRole {
  return Object.values(ORGANIZATION_ROLES).includes(role as OrganizationRole);
}

function hasPermission(
  userRole: ProjectRole,
  requiredRole: ProjectRole,
): boolean {
  const hierarchy = { ADMIN: 3, USER: 2, VIEWER: 1 };
  return hierarchy[userRole] >= hierarchy[requiredRole];
}

function hasOrganizationPermission(
  userRole: OrganizationRole,
  requiredRole: OrganizationRole,
): boolean {
  const hierarchy = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };
  return hierarchy[userRole] >= hierarchy[requiredRole];
}

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly usersRepo: UsersRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private readonly organizationRepo: OrganizationRepository,
  ) {}

  private async getUserOrganizationRole(
    userId: string,
    organizationId?: string,
  ): Promise<OrganizationRole | null> {
    const whereClause: any = { userId };
    if (organizationId) {
      whereClause.organizationId = organizationId;
    }

    const organizationMember = await this.organizationMemberRepo.findOne({
      where: whereClause,
    });

    if (
      !organizationMember ||
      !isValidOrganizationRole(organizationMember.role)
    ) {
      return null;
    }

    return organizationMember.role as OrganizationRole;
  }
  create(createProjectDto: any) {
    return this.projectRepo.create({
      data: {
        name: createProjectDto.name,
        organizationId: createProjectDto?.organizationId,
        description: createProjectDto.description,
        accessImageAmount: createProjectDto.accessImageAmount,
        remainImageAmount: createProjectDto.remainImageAmount,
        accessTokenAmount: createProjectDto.accessTokenAmount,
        remainTokenAmount: createProjectDto.remainTokenAmount,
        members: createProjectDto.members?.length
          ? {
              create: createProjectDto.members.map(
                (member: string | ProjectMemberInput) => ({
                  users: {
                    connect: {
                      userId:
                        typeof member === 'string' ? member : member.userId,
                    },
                  },
                  role: typeof member === 'object' ? member.role : 'USER',
                  maxToken:
                    typeof member === 'object' ? member.maxToken || 0 : 0,
                  maxImages:
                    typeof member === 'object' ? member.maxImages || 0 : 0,
                }),
              ),
            }
          : undefined,
      },
    });
  }

  findAll() {
    return this.projectRepo.findMany({ include: { members: true } });
  }

  async findOne(id: string) {
    const user = await this.usersRepo.findOne({
      where: { token: id },
    });

    if (!user) {
      throw new Error('User not found for this token');
    }

    const organizationRole = await this.getUserOrganizationRole(user.userId);
    const isSuperAdmin = organizationRole === 'SUPER_ADMIN';
    const isOwner = organizationRole === 'OWNER';
    const isAdmin = organizationRole === 'ADMIN';

    const isShowAll = isOwner || isAdmin || isSuperAdmin;

    const res = await this.projectRepo.findMany({
      where: {
        ...(!isSuperAdmin && { status: { not: 'deleted' } }),
        ...(!isShowAll && {
          members: { some: { userId: user.userId } },
        }),
      },
      include: { members: true },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return res;
  }

  async findById(id: string) {
    return this.projectRepo.findOne({ where: { id } });
  }
  async findByOrganizationId(organizationId: string, token: string) {
    const user = await this.usersRepo.findOne({ where: { token } });

    if (!user) {
      throw new Error('User not found for this token');
    }

    const organizationRole = await this.getUserOrganizationRole(
      user.userId,
      organizationId,
    );
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const isOwner = organizationRole === 'OWNER';
    const isAdmin = organizationRole === 'ADMIN';

    const isShowAll = isOwner || isAdmin || isSuperAdmin;
    const data = await this.projectRepo.findMany({
      where: {
        organizationId,
        ...(!isSuperAdmin && { status: { not: 'deleted' } }),
        ...(!isShowAll && {
          members: {
            some: {
              users: {
                userId: user.userId,
              },
            },
          },
        }),
      },
      include: { members: true },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return data;
  }

  update(id: string, updateProjectDto: any) {
    return this.projectRepo.update({
      where: { id },
      data: {
        ...updateProjectDto,
        members:
          updateProjectDto.members !== undefined
            ? {
                deleteMany: {},
                ...(updateProjectDto.members.length > 0 && {
                  create: updateProjectDto.members.map(
                    (member: string | ProjectMemberInput) => ({
                      users: {
                        connect: {
                          userId:
                            typeof member === 'string' ? member : member.userId,
                        },
                      },
                      role: typeof member === 'object' ? member.role : 'USER', // Default to USER role
                      maxToken:
                        typeof member === 'object' ? member.maxToken || 0 : 0,
                      maxImages:
                        typeof member === 'object' ? member.maxImages || 0 : 0,
                    }),
                  ),
                }),
              }
            : undefined,
      },
    });
  }
  async deleteProject(id: string) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (project) {
      await this.projectRepo.update({
        where: { id },
        data: {
          status: 'deleted',
          accessImageAmount: 0,
          accessTokenAmount: 0,
          remainImageAmount: 0,
          remainTokenAmount: 0,
        },
      });
      await this.projectMemberRepo.updateMany({
        where: { projectId: project.id },
        data: {
          maxImages: 0,
          maxToken: 0,
        },
      });
      this.organizationRepo.update({
        where: { organizationId: project.organizationId },
        data: {
          remainImageAmount: { increment: project.accessImageAmount },
          remainTokenAmount: { increment: project.accessTokenAmount },
        },
      });
    } else {
      throw new Error('Project not found');
    }
  }

  remove(id: string) {
    return this.projectRepo.delete({ where: { id } });
  }

  async checkUserRole(
    projectId: string,
    userId: string,
  ): Promise<string | null> {
    const organizationRole = await this.getUserOrganizationRole(userId);

    if (
      organizationRole === 'OWNER' ||
      organizationRole === 'ADMIN' ||
      organizationRole === 'SUPER_ADMIN'
    ) {
      return 'OWNER';
    }

    const member = await this.projectMemberRepo.findOne({
      where: {
        projectId,
        userId,
      },
    });

    return member?.role || null;
  }

  async isProjectAdmin(projectId: string, userId: string): Promise<boolean> {
    const role = await this.checkUserRole(projectId, userId);
    return role === 'ADMIN' || role === 'OWNER' || role === 'SUPER_ADMIN';
  }

  async getProjectMembers(projectId: string) {
    return this.projectRepo.findOne({
      where: { id: projectId },
      include: {
        members: {
          include: {
            users: {
              select: {
                userId: true,
                username: true,
                fullname: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async hasProjectPermission(
    projectId: string,
    userId: string,
    requiredRole: ProjectRole = 'USER',
  ): Promise<boolean> {
    const userRole = await this.checkUserRole(projectId, userId);

    if (userRole === 'OWNER') return true;

    if (!userRole || !isValidRole(userRole)) return false;
    return hasPermission(userRole as ProjectRole, requiredRole);
  }
}
