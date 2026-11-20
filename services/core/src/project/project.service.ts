import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthUser,
  ProjectRepository,
  UsersRepository,
  ProjectMemberRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  PrismaService,
  roundCredit,
  unallocatedCredit,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { UpdateProjectDto } from './dto/update-project.dto';
import { planMemberChanges } from './project-members.plan';

type CreditDb = Pick<Prisma.TransactionClient, 'creditBalance' | 'project'>;

// project ที่ถูกลบจะมี status 'deleted' ส่วนข้อมูลเก่าอาจเป็น null
const NOT_DELETED_PROJECT: Prisma.ProjectWhereInput = {
  OR: [{ status: null }, { status: { not: 'deleted' } }],
};

interface ProjectMemberInput {
  userId: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  maxToken?: number;
  maxImages?: number;
  limitCreditAllowance?: number;
  limitImageAllowance?: number;
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
    private readonly prisma: PrismaService,
  ) {}

  private async getUserOrganizationRole(
    userId: string,
    organizationId?: string,
  ): Promise<OrganizationRole | null> {
    const whereClause: any = { userId, status: 'active' };
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
  async create(createProjectDto: any) {
    const limit = Number(createProjectDto.limitCreditAllowance ?? 0);
    if (limit > 0 && createProjectDto.organizationId) {
      const available = await this.unallocatedFor(
        this.prisma,
        createProjectDto.organizationId,
      );
      if (roundCredit(limit) > available) {
        throw new BadRequestException(
          `Credit limit ${limit} exceeds organization credit available to assign (${Math.max(available, 0)})`,
        );
      }
    }
    return this.projectRepo.create({
      data: {
        name: createProjectDto.name,
        organizationId: createProjectDto?.organizationId,
        description: createProjectDto.description,
        limitCreditAllowance: createProjectDto.limitCreditAllowance,
        limitImageAllowance: createProjectDto.limitImageAllowance,
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
                  limitCreditAllowance:
                    typeof member === 'object'
                      ? member.limitCreditAllowance || 0
                      : 0,
                  limitImageAllowance:
                    typeof member === 'object'
                      ? member.limitImageAllowance || 0
                      : 0,
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
  async findByOrganizationId(
    organizationId: string,
    query: { name?: string; token: string; status?: string },
  ) {
    const { name, token, status } = query;
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

    // Build status filter: never show deleted to non-superadmins;
    // combine with the requested status so the spread doesn't overwrite it.
    const statusFilter = isSuperAdmin
      ? status || undefined
      : status && status !== 'deleted'
        ? status
        : { not: 'deleted' };

    const data = await this.projectRepo.findMany({
      where: {
        ...(name && { name: { contains: name, mode: 'insensitive' } }),
        status: statusFilter,
        organizationId,
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
      orderBy: {
        createdAt: 'desc',
      },
    });
    return data;
  }

  /**
   * Update project fields and member limits; members are diffed, never recreated,
   * so used/hold counters survive. Only org OWNER/ADMIN or SUPER_ADMIN may call it.
   */
  async update(id: string, dto: UpdateProjectDto, authUser?: AuthUser) {
    const project = await this.projectRepo.findOne({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    await this.assertCanManageProject(
      project.organizationId,
      authUser?.userId ?? dto.userId,
    );

    const { members, userId: _caller, ...fields } = dto;
    const newLimit = fields.limitCreditAllowance;
    const limitChanged =
      newLimit !== undefined && newLimit !== project.limitCreditAllowance;
    return this.prisma.$transaction(async (tx) => {
      const existing =
        members !== undefined || limitChanged
          ? await tx.projectMember.findMany({ where: { projectId: id } })
          : [];
      if (limitChanged) {
        await this.assertProjectLimit(tx, project, newLimit, existing);
      }
      if (members !== undefined) {
        const changes = planMemberChanges(
          existing,
          members,
          fields.limitCreditAllowance ?? project.limitCreditAllowance,
        );
        if (changes.removeIds.length > 0) {
          await tx.projectMember.deleteMany({
            where: { id: { in: changes.removeIds } },
          });
        }
        for (const { id: memberId, data } of changes.update) {
          await tx.projectMember.update({ where: { id: memberId }, data });
        }
        if (changes.create.length > 0) {
          await tx.projectMember.createMany({
            data: changes.create.map((member) => ({ ...member, projectId: id })),
          });
        }
      }
      return tx.project.update({ where: { id }, data: fields });
    });
  }

  /** Credit the org can still hand out, plus the project's own used credit when editing it */
  async getCreditCapacity(organizationId: string, excludeProjectId?: string) {
    const project = excludeProjectId
      ? await this.projectRepo.findOne({ where: { id: excludeProjectId } })
      : null;
    return {
      unallocated: await this.unallocatedFor(
        this.prisma,
        organizationId,
        excludeProjectId,
      ),
      projectUsed: project?.usedCreditAllowance ?? 0,
    };
  }

  private async unallocatedFor(
    db: CreditDb,
    organizationId: string,
    excludeProjectId?: string,
  ): Promise<number> {
    const pool = await db.creditBalance.findUnique({
      where: { organizationId },
      select: { currentCycleBalance: true, onTopBalance: true },
    });
    const projects = await db.project.findMany({
      where: {
        organizationId,
        ...(excludeProjectId && { id: { not: excludeProjectId } }),
        AND: [NOT_DELETED_PROJECT],
      },
      select: { limitCreditAllowance: true, usedCreditAllowance: true },
    });
    return unallocatedCredit(pool, projects);
  }

  /**
   * A project limit may not drop below what is used or held, and may only grow
   * by what the org has not handed out yet. Lowering is always allowed down to that floor.
   * @throws BadRequestException when the new limit breaks either rule
   */
  private async assertProjectLimit(
    db: CreditDb,
    project: {
      id: string;
      organizationId: string | null;
      limitCreditAllowance: number;
      usedCreditAllowance: number;
    },
    newLimit: number,
    members: { holdCreditAllowance: number }[],
  ): Promise<void> {
    const held = members.reduce((sum, m) => sum + m.holdCreditAllowance, 0);
    const spent = roundCredit(project.usedCreditAllowance + held);
    if (newLimit < spent) {
      throw new BadRequestException(
        `Project credit limit ${newLimit} is below credit already used (${spent})`,
      );
    }
    if (newLimit <= project.limitCreditAllowance || !project.organizationId) {
      return;
    }
    const max = roundCredit(
      (await this.unallocatedFor(db, project.organizationId, project.id)) +
        project.usedCreditAllowance,
    );
    if (newLimit > max) {
      throw new BadRequestException(
        `Project credit limit ${newLimit} exceeds credit available to assign (${Math.max(max, 0)})`,
      );
    }
  }

  /** @throws ForbiddenException unless the caller is OWNER/ADMIN of the project's org or SUPER_ADMIN */
  private async assertCanManageProject(
    organizationId: string | null,
    caller: string | undefined,
  ): Promise<void> {
    const user = caller
      ? await this.usersRepo.findOne({
          where: { OR: [{ userId: caller }, { token: caller }] },
        })
      : null;
    if (!user) throw new ForbiddenException('Unknown caller');
    if (user.role === 'SUPER_ADMIN') return;
    const role = organizationId
      ? await this.getUserOrganizationRole(user.userId, organizationId)
      : null;
    if (role !== 'OWNER' && role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only organization owners or admins can edit a project',
      );
    }
  }
  async deleteProject(id: string) {
    
      const project = await this.projectRepo.findOne(
        { where: { id } },
      );
      if (!project) throw new Error('Project not found');
      await this.projectRepo.update(
        {
          where: { id },
          data: {
            status: 'deleted',
            limitCreditAllowance: 0,
            limitImageAllowance: 0,
          },
        },
      );
      await this.projectMemberRepo.updateMany(
        {
          where: { projectId: id },
          data: { limitImageAllowance: 0, limitCreditAllowance: 0 },
        },
      );
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
