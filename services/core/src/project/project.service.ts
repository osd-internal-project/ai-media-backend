import { Injectable } from '@nestjs/common';
import { ProjectRepository, UsersRepository, ProjectMemberRepository } from '@ai-media/share';
import { Prisma } from '@prisma/client';

interface ProjectMemberInput {
  userId: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
}

// Role validation and hierarchy utilities
const PROJECT_ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER', 
  VIEWER: 'VIEWER'
} as const;

type ProjectRole = keyof typeof PROJECT_ROLES;

function isValidRole(role: string): role is ProjectRole {
  return Object.values(PROJECT_ROLES).includes(role as ProjectRole);
}

function hasPermission(userRole: ProjectRole, requiredRole: ProjectRole): boolean {
  const hierarchy = { ADMIN: 3, USER: 2, VIEWER: 1 };
  return hierarchy[userRole] >= hierarchy[requiredRole];
}

@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly usersRepo: UsersRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
  ) {}
  create(createProjectDto: any) {
    return this.projectRepo.create({
      data: {
        name: createProjectDto.name,
        description: createProjectDto.description,
        organizationId: createProjectDto.organizationId,
        members: createProjectDto.members?.length
          ? {
              create: createProjectDto.members.map((member: string | ProjectMemberInput) => ({
                users: { connect: { userId: typeof member === 'string' ? member : member.userId } },
                role: typeof member === 'object' ? member.role : 'USER',
              })),
            }
          : undefined,
      },
    });
  }

  findAll() {
    return this.projectRepo.findMany({ include: { members: true } });
  }

  async findOne(id: string) {
    const user = (await this.usersRepo.findOne({
      where: { token: id },
      include: {
        groups: {
          include: {
            group: {
              select: {
                name: true,
                displayName: true,
                id: true,
              },
            },
          },
        },
      },
    })) as any;
    const isAdmin = user.groups.some(
      (g: any) => g.group?.name === 'admin-user',
    );
    if (!user) {
      throw new Error('User not found for this token');
    }
    const res = await this.projectRepo.findMany({
      where: {
        ...(!isAdmin && { status: { not: 'deleted' } }),
        members: { some: { ...(!isAdmin && { userId: user.userId }) } },
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
    const { userId } = await this.usersRepo.findOne({ where: { token } });
    return this.projectRepo.findMany({
      where: {
        organizationId,
        members: {
          some: {
            users: {
              userId: userId,
            },
          },
        },
      },
      include: { members: true },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
  update(id: string, updateProjectDto: any) {
    return this.projectRepo.update({
      where: { id },
      data: {
        ...updateProjectDto,
        members: updateProjectDto.members?.length
          ? {
              deleteMany: {},
              create: updateProjectDto.members.map((member: string | ProjectMemberInput) => ({
                users: { connect: { userId: typeof member === 'string' ? member : member.userId } },
                role: typeof member === 'object' ? member.role : 'USER', // Default to USER role
              })),
            }
          : undefined,
      },
    });
  }

  remove(id: string) {
    return this.projectRepo.delete({ where: { id } });
  }

  // Check if user has specific role in project
  async checkUserRole(projectId: string, userId: string): Promise<string | null> {
    const member = await this.projectMemberRepo.findOne({
      where: {
        projectId,
        userId
      }
    });
    
    return member?.role || null;
  }

  // Check if user has admin role in project
  async isProjectAdmin(projectId: string, userId: string): Promise<boolean> {
    const role = await this.checkUserRole(projectId, userId);
    return role === 'ADMIN';
  }

  // Get all project members with their roles
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
                email: true
              }
            }
          }
        }
      }
    });
  }

  // Check if user has permission for specific action
  async hasProjectPermission(
    projectId: string, 
    userId: string, 
    requiredRole: ProjectRole = 'USER'
  ): Promise<boolean> {
    const userRole = await this.checkUserRole(projectId, userId);
    if (!userRole || !isValidRole(userRole)) return false;
    return hasPermission(userRole as ProjectRole, requiredRole);
  }
}
