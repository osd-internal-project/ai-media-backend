import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthUser,
  CreditBalanceRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
  OrganizationSubscriptionRepository,
  PrismaTransactionService,
  ProjectMemberRepository,
  ProjectRepository,
  RequestChangePasswordRepository,
  UsersRepository,
} from '@ai-media/share';
import { Prisma } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import * as dayjs from 'dayjs';
import configs from 'src/configs';
import { KeycloakService } from 'src/keycloak/keycloak.service';
import { checkPasswordPolicy } from 'src/users/password-policy';
import {
  BulkAddMembersDto,
  BulkCreateChunkDto,
  BulkMemberRowDto,
  BulkNewProjectDto,
} from './dto/bulk-add-members.dto';
import { MemberStatus } from './dto/bulk-member-actions.dto';

const ACCESS_LINK_TTL_DAYS = 7;
const SYSTEM_ADMIN_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];
const ORG_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];
const PROJECT_ROLES = ['ADMIN', 'USER', 'VIEWER'];
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,100}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEYCLOAK_LOOKUP_CONCURRENCY = 5;
// ค่าเดียวกับ OrganizationMembersService.create (organization-members.service.ts)
const DEFAULT_MEMBER_QUOTA = 10000;
// project ที่ถูกลบจะมี status 'deleted' ส่วนข้อมูลเก่าอาจเป็น null
const NOT_DELETED_PROJECT: Prisma.ProjectWhereInput = {
  OR: [{ status: null }, { status: { not: 'deleted' } }],
};

export type BulkRowStatus = 'NEW_USER' | 'EXISTING_USER' | 'ERROR';

export interface BulkRowResult {
  rowIndex: number;
  status: BulkRowStatus;
  errors: string[];
}

export interface BulkValidationResult {
  valid: boolean;
  errors: string[];
  seat: { current: number; adding: number; max: number | null };
  credit: {
    orgRemaining: number;
    newProjects: { name: string; limitCreditAllowance: number }[];
  };
  rows: BulkRowResult[];
}

interface NormalizedRow {
  rowIndex: number;
  username: string;
  email: string;
  fullname: string;
  password: string;
  phoneNumber: string;
  role: string;
  projectId: string;
  projectName: string;
  projectRole: string;
  credit: number | null;
}

interface RowPlan {
  row: NormalizedRow;
  errors: string[];
  userId: string | null;
  isNewUser: boolean;
  isNewOrgMember: boolean;
}

interface ValidationContext {
  plans: RowPlan[];
  result: BulkValidationResult;
}

type ChunkRow = BulkMemberRowDto & { rowIndex: number };

@Injectable()
export class OrganizationBulkMemberService {
  private readonly logger = new Logger(OrganizationBulkMemberService.name);

  constructor(
    private readonly organizationRepo: OrganizationRepository,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly usersRepo: UsersRepository,
    private readonly organizationSubscriptionRepo: OrganizationSubscriptionRepository,
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly keycloakService: KeycloakService,
    private readonly transaction: PrismaTransactionService,
    private readonly requestChangePasswordRepo: RequestChangePasswordRepository,
    private readonly httpService: HttpService,
  ) {}

  /** ลบ membership ของ org นี้ (ไม่ลบ user/Keycloak) — OWNER และ id ของ org อื่นถูกข้าม */
  async removeMembers(
    organizationId: string,
    memberIds: number[],
    authUser: AuthUser | undefined,
  ) {
    this.assertSuperAdmin(authUser);
    const { count } = await this.organizationMemberRepo.deleteMany({
      where: this.selectableMembers(organizationId, memberIds),
    });
    return { removed: count, skipped: memberIds.length - count };
  }

  /** เปิด/ปิดสิทธิ์เฉพาะ org นี้ — ไม่แตะ users.status หรือ Keycloak */
  async setMembersStatus(
    organizationId: string,
    memberIds: number[],
    status: MemberStatus,
    authUser: AuthUser | undefined,
  ) {
    this.assertSuperAdmin(authUser);
    const { count } = await this.organizationMemberRepo.updatemany({
      where: this.selectableMembers(organizationId, memberIds),
      data: { status },
    });
    return { updated: count, skipped: memberIds.length - count };
  }

  /** ส่งลิงก์ตั้งรหัสผ่าน (ใช้หน้า /change-password เดิม) ให้ member ที่เลือก */
  async sendAccessEmails(
    organizationId: string,
    memberIds: number[],
    authUser: AuthUser | undefined,
  ) {
    this.assertSuperAdmin(authUser);
    const org = await this.findOrganization(organizationId);
    const members = await this.organizationMemberRepo.findMany({
      where: { organizationId, id: { in: memberIds } },
      select: { userId: true },
    });
    const users = await this.usersRepo.findMany({
      where: { userId: { in: members.map((m) => m.userId) } },
      select: { username: true, email: true },
    });

    let sent = 0;
    const failed: { email: string; reason: string }[] = [];
    for (const user of users) {
      if (!user.email) {
        failed.push({ email: user.username, reason: 'No email' });
        continue;
      }
      try {
        await this.sendAccessEmail(org.name, user.username, user.email);
        sent += 1;
      } catch (error) {
        this.logger.error(
          `bulk-members: access email to ${user.email} failed: ${error?.message}`,
        );
        failed.push({ email: user.email, reason: error?.message ?? 'Failed' });
      }
    }
    return { sent, skipped: memberIds.length - members.length, failed };
  }

  private selectableMembers(
    organizationId: string,
    memberIds: number[],
  ): Prisma.OrganizationMemberWhereInput {
    return { organizationId, id: { in: memberIds }, role: { not: 'OWNER' } };
  }

  private async sendAccessEmail(
    teamName: string,
    username: string,
    email: string,
  ) {
    const token = uuidv4();
    await this.requestChangePasswordRepo.create({
      data: {
        email,
        username,
        token,
        status: 'PENDING',
        expiresAt: dayjs().add(ACCESS_LINK_TTL_DAYS, 'day').toDate(),
      },
    });
    const { data } = await firstValueFrom(
      this.httpService.post(`${configs().emailApiUrl}/email/send`, {
        to: email,
        // no "password" in the subject — O365 flags it as phishing
        subject: `คุณได้รับสิทธิ์เข้าใช้งาน AI Cave : ${teamName} แล้ว`,
        template: 'account-access',
        context: {
          teamName,
          username,
          email,
          expires_in: `${ACCESS_LINK_TTL_DAYS} days`,
          action_url: `${configs().frontendUrl}/change-password?token=${token}`,
          login_url: `${configs().frontendUrl}/login`,
        },
      }),
    );
    // email-api reports SMTP failures in the body instead of an HTTP error
    if (!data?.success) throw new Error(data?.error ?? 'Email not sent');
    this.logger.log(`bulk-members: access email sent to ${email}`);
  }

  /** project ที่ยังไม่ถูกลบของ org พร้อมยอด credit ที่แจกให้ member แล้ว — ใช้เติม Select ในตาราง */
  async listProjects(organizationId: string, authUser: AuthUser | undefined) {
    this.assertSuperAdmin(authUser);
    await this.findOrganization(organizationId);

    const projects = await this.projectRepo.findMany({
      where: { organizationId, AND: [NOT_DELETED_PROJECT] },
      select: { id: true, name: true, limitCreditAllowance: true },
      orderBy: { createdAt: 'desc' },
    });
    const assigned = await this.sumAssignedCredit(projects.map((p) => p.id));
    const creditRemaining = await this.orgCreditRemaining(organizationId);

    return {
      creditRemaining,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        limitCreditAllowance: p.limitCreditAllowance,
        assignedCredit: assigned.get(p.id) ?? 0,
      })),
    };
  }

  /** ตรวจทั้งตาราง (ไม่เขียนอะไร) */
  async validate(
    organizationId: string,
    dto: BulkAddMembersDto,
    authUser: AuthUser | undefined,
  ): Promise<BulkValidationResult> {
    this.assertSuperAdmin(authUser);
    const rows = dto.rows.map((row, rowIndex) => ({ ...row, rowIndex }));
    const { result } = await this.validateRows(organizationId, rows, null);
    return result;
  }

  /**
   * สร้าง user/member หนึ่ง chunk — re-validate กับสถานะปัจจุบันก่อน ถ้ามีแถวผิดจะไม่เขียนอะไรเลย
   * แถวที่พังระหว่างสร้าง (เช่น Keycloak ล่ม) ได้ status ERROR และทำแถวถัดไปต่อ
   */
  async createChunk(
    organizationId: string,
    dto: BulkCreateChunkDto,
    authUser: AuthUser | undefined,
  ) {
    this.assertSuperAdmin(authUser);
    const { plans, result } = await this.validateRows(
      organizationId,
      dto.rows,
      dto.newProjects,
    );
    if (!result.valid) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.errors,
        rows: result.rows,
      });
    }

    const projectIds = await this.createNewProjects(
      organizationId,
      plans,
      dto.newProjects,
    );

    const results: BulkRowResult[] = [];
    for (const plan of plans) {
      results.push(await this.createRow(organizationId, plan, projectIds));
    }

    return {
      results,
      createdProjects: [...projectIds.entries()].map(([key, id]) => ({
        name: dto.newProjects.find((p) => this.key(p.name) === key)?.name,
        id,
      })),
    };
  }

  private assertSuperAdmin(authUser: AuthUser | undefined) {
    // 403 ไม่ใช่ 401 — guard ผ่านมาแล้วแต่ไม่มี authUser (AUTH_MODE off/report) re-login ไม่ช่วย และ 401 ทำให้ frontend redirect วน
    if (!authUser) throw new ForbiddenException('Missing authenticated user');
    // trim ก่อนเทียบ — ข้อมูล role ในระบบมีค่าที่ติดช่องว่างท้ายอยู่จริง
    const role = authUser.role?.trim();
    if (!role || !SYSTEM_ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Only a system administrator can import users',
      );
    }
  }

  private async findOrganization(organizationId: string) {
    const org = await this.organizationRepo.findOne({
      where: { organizationId },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * @param newProjects null = ตรวจทั้งตาราง (คำนวณ limit ของ project ใหม่จากแถว);
   *   มีค่า = ตรวจ chunk โดยใช้ limit ที่คำนวณจากทั้งตารางตอน validate
   */
  private async validateRows(
    organizationId: string,
    rawRows: ChunkRow[],
    newProjects: BulkNewProjectDto[] | null,
  ): Promise<ValidationContext> {
    const org = await this.findOrganization(organizationId);
    const batchErrors: string[] = [];
    const plans: RowPlan[] = rawRows.map((raw) => ({
      row: this.normalize(raw),
      errors: [],
      userId: null,
      isNewUser: false,
      isNewOrgMember: true,
    }));

    plans.forEach((plan) => this.checkFormat(plan));
    this.checkDuplicatesInTable(plans);
    await this.resolveUsers(plans);

    const members = await this.organizationMemberRepo.findMany({
      where: { organizationId },
      select: { userId: true },
    });
    const memberIds = new Set(members.map((m) => m.userId));
    for (const plan of plans) {
      if (!plan.userId || !memberIds.has(plan.userId)) continue;
      plan.isNewOrgMember = false;
      if (!this.hasProject(plan.row)) {
        plan.errors.push('Already a member of this organization');
      }
    }

    await this.checkPasswords(plans);
    const orgRemaining = await this.orgCreditRemaining(organizationId);
    const newProjectLimits = await this.checkProjects(
      organizationId,
      plans,
      newProjects,
      orgRemaining,
    );

    const current = members.length;
    const adding = plans.filter((p) => p.isNewOrgMember).length;
    const max = org.maxUserAccess ?? null;
    if (max !== null && current + adding > max) {
      batchErrors.push(
        `Seat limit exceeded: ${current} members + ${adding} new > ${max} seats`,
      );
    }

    const rows: BulkRowResult[] = plans.map((p) => ({
      rowIndex: p.row.rowIndex,
      status: p.errors.length
        ? 'ERROR'
        : p.isNewUser
        ? 'NEW_USER'
        : 'EXISTING_USER',
      errors: p.errors,
    }));

    return {
      plans,
      result: {
        valid: !batchErrors.length && rows.every((r) => r.status !== 'ERROR'),
        errors: batchErrors,
        seat: { current, adding, max },
        credit: { orgRemaining, newProjects: newProjectLimits },
        rows,
      },
    };
  }

  private normalize(raw: ChunkRow): NormalizedRow {
    const text = (value?: string) => (value ?? '').trim();
    const projectId = text(raw.projectId);
    const projectName = text(raw.projectName);
    const hasProject = !!(projectId || projectName);
    return {
      rowIndex: raw.rowIndex,
      // Keycloak เก็บ username เป็นตัวเล็กเสมอ — เก็บใน DB ให้ตรงกัน
      username: text(raw.username).toLowerCase(),
      email: text(raw.email).toLowerCase(),
      fullname: text(raw.fullname),
      password: raw.password ?? '',
      phoneNumber: text(raw.phoneNumber),
      role: text(raw.role).toUpperCase() || 'MEMBER',
      projectId,
      projectName,
      projectRole:
        text(raw.projectRole).toUpperCase() || (hasProject ? 'USER' : ''),
      credit: raw.credit ?? null,
    };
  }

  private hasProject(row: NormalizedRow) {
    return !!(row.projectId || row.projectName);
  }

  private checkFormat({ row, errors }: RowPlan) {
    if (!row.username) errors.push('Username is required');
    else if (!USERNAME_PATTERN.test(row.username)) {
      errors.push(
        'Username must be 3-100 characters: letters, digits, dot, dash or underscore',
      );
    }
    if (!row.email) errors.push('Email is required');
    else if (!EMAIL_PATTERN.test(row.email)) errors.push('Email is invalid');
    if (!ORG_ROLES.includes(row.role)) {
      errors.push(`Role must be one of ${ORG_ROLES.join(', ')}`);
    }
    if (row.projectId && row.projectName) {
      errors.push('Use either projectId (existing) or projectName (new), not both');
    }
    if (!this.hasProject(row)) {
      if (row.credit !== null) errors.push('Credit requires a project');
      if (row.projectRole) errors.push('Project role requires a project');
    } else if (!PROJECT_ROLES.includes(row.projectRole)) {
      errors.push(`Project role must be one of ${PROJECT_ROLES.join(', ')}`);
    }
    if (row.credit !== null && row.credit < 0) {
      errors.push('Credit must be 0 or more');
    }
  }

  private checkDuplicatesInTable(plans: RowPlan[]) {
    const mark = (field: 'username' | 'email', label: string) => {
      const groups = new Map<string, RowPlan[]>();
      for (const plan of plans) {
        const value = plan.row[field];
        if (!value) continue;
        groups.set(value, [...(groups.get(value) ?? []), plan]);
      }
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const others = group.map((p) => p.row.rowIndex + 1).join(', ');
        group.forEach((p) =>
          p.errors.push(`${label} is duplicated in rows ${others}`),
        );
      }
    };
    mark('username', 'Username');
    mark('email', 'Email');
  }

  /** จับคู่แถวกับ user เดิม: username + email ต้องเป็นคนเดียวกัน ไม่งั้นถือว่าชนกับคนอื่น */
  private async resolveUsers(plans: RowPlan[]) {
    const usable = plans.filter((p) => p.row.username && p.row.email);
    if (!usable.length) return;

    const dbUsers = await this.usersRepo.findMany({
      where: {
        OR: [
          {
            username: {
              in: usable.map((p) => p.row.username),
              mode: 'insensitive',
            },
          },
          {
            email: {
              in: usable.map((p) => p.row.email),
              mode: 'insensitive',
            },
          },
        ],
      },
      select: { userId: true, username: true, email: true },
    });

    const unmatched: RowPlan[] = [];
    for (const plan of usable) {
      const byUsername = dbUsers.find(
        (u) => u.username.toLowerCase() === plan.row.username,
      );
      const byEmail = dbUsers.filter(
        (u) => u.email?.toLowerCase() === plan.row.email,
      );
      if (byUsername) {
        if (byEmail.some((u) => u.userId === byUsername.userId)) {
          plan.userId = byUsername.userId;
        } else {
          plan.errors.push(
            'Username already belongs to another user with a different email',
          );
        }
      } else if (byEmail.length) {
        plan.errors.push(
          'Email is already used by another user with a different username',
        );
      } else {
        unmatched.push(plan);
      }
    }

    // DB ไม่เจอ → เช็ค Keycloak ด้วย กันสร้างทับบัญชีที่มีอยู่แค่ใน Keycloak
    for (let i = 0; i < unmatched.length; i += KEYCLOAK_LOOKUP_CONCURRENCY) {
      const batch = unmatched.slice(i, i + KEYCLOAK_LOOKUP_CONCURRENCY);
      const found = await Promise.all(
        batch.map((p) =>
          this.keycloakService.findUserByUsernameOrEmail(
            p.row.username,
            p.row.email,
          ),
        ),
      );
      batch.forEach((plan, index) => {
        if (found[index]?.length) {
          plan.errors.push(
            'Username or email already exists in Keycloak but not in the system',
          );
        } else {
          plan.isNewUser = true;
        }
      });
    }
  }

  private async checkPasswords(plans: RowPlan[]) {
    const newUsers = plans.filter((p) => p.isNewUser);
    if (!newUsers.length) return;
    const policy = await this.keycloakService.getPasswordPolicy();
    for (const plan of newUsers) {
      if (!plan.row.fullname) plan.errors.push('Full name is required');
      if (!plan.row.password) {
        plan.errors.push('Password is required for a new user');
        continue;
      }
      const error = checkPasswordPolicy(plan.row.password, policy);
      if (error) plan.errors.push(error);
    }
  }

  /** ตรวจ project/credit แล้วคืน limit ของ project ใหม่ (ผลรวม credit ของแถวที่เข้า project นั้น) */
  private async checkProjects(
    organizationId: string,
    plans: RowPlan[],
    newProjects: BulkNewProjectDto[] | null,
    orgRemaining: number,
  ) {
    const withProject = plans.filter((p) => this.hasProject(p.row));
    const ids = [...new Set(withProject.map((p) => p.row.projectId).filter(Boolean))];
    const names = [
      ...new Set(withProject.map((p) => p.row.projectName).filter(Boolean)),
    ];

    const existing =
      ids.length || names.length
        ? await this.projectRepo.findMany({
            where: {
              organizationId,
              AND: [
                NOT_DELETED_PROJECT,
                {
                  OR: [
                    { id: { in: ids } },
                    { name: { in: names, mode: 'insensitive' } },
                  ],
                },
              ],
            },
            select: { id: true, name: true, limitCreditAllowance: true },
          })
        : [];
    const byId = new Map(existing.map((p) => [p.id, p]));
    const takenNames = new Set(existing.map((p) => this.key(p.name)));

    const projectMembers = byId.size
      ? await this.projectMemberRepo.findMany({
          where: { projectId: { in: [...byId.keys()] } },
          select: { projectId: true, userId: true, limitCreditAllowance: true },
        })
      : [];
    const memberKeys = new Set(
      projectMembers.map((m) => `${m.projectId}:${m.userId}`),
    );

    for (const plan of withProject) {
      const { projectId, projectName } = plan.row;
      if (projectId && !byId.has(projectId)) {
        plan.errors.push('Project not found in this organization');
      }
      if (projectName && takenNames.has(this.key(projectName))) {
        plan.errors.push(
          `Project "${projectName}" already exists — select the existing project instead`,
        );
      }
      if (projectId && plan.userId && memberKeys.has(`${projectId}:${plan.userId}`)) {
        plan.errors.push('Already a member of this project');
      }
    }

    // project เดิม: ไม่แตะ limit ของ project — credit ที่แจกรวมต้องไม่เกิน limit
    const assigned = new Map<string, number>();
    projectMembers.forEach((m) =>
      assigned.set(
        m.projectId,
        (assigned.get(m.projectId) ?? 0) + (m.limitCreditAllowance ?? 0),
      ),
    );
    for (const [id, project] of byId) {
      const rows = withProject.filter((p) => p.row.projectId === id);
      const adding = this.sumCredit(rows);
      const used = assigned.get(id) ?? 0;
      if (adding > 0 && used + adding > project.limitCreditAllowance) {
        rows
          .filter((p) => (p.row.credit ?? 0) > 0)
          .forEach((p) =>
            p.errors.push(
              `Credit exceeds project "${project.name}" limit: ${used} assigned + ${adding} importing > ${project.limitCreditAllowance}`,
            ),
          );
      }
    }

    // project ใหม่: limit = ผลรวม credit ของทั้งตาราง และต้องไม่เกิน credit ที่ org เหลือ
    const groups = new Map<string, RowPlan[]>();
    withProject
      .filter((p) => p.row.projectName)
      .forEach((p) => {
        const key = this.key(p.row.projectName);
        groups.set(key, [...(groups.get(key) ?? []), p]);
      });

    const limits = [...groups.entries()].map(([key, rows]) => {
      const defined = newProjects?.find((p) => this.key(p.name) === key);
      if (newProjects && !defined) {
        rows.forEach((p) =>
          p.errors.push(`New project "${p.row.projectName}" is missing its definition`),
        );
      }
      const fromRows = this.sumCredit(rows);
      if (defined && fromRows > defined.limitCreditAllowance) {
        rows.forEach((p) =>
          p.errors.push(
            `Credit exceeds new project "${defined.name}" limit ${defined.limitCreditAllowance}`,
          ),
        );
      }
      return {
        name: defined?.name ?? rows[0].row.projectName,
        limitCreditAllowance: defined?.limitCreditAllowance ?? fromRows,
        rows,
      };
    });

    const totalNew = limits.reduce((sum, p) => sum + p.limitCreditAllowance, 0);
    if (totalNew > orgRemaining) {
      limits.forEach(({ rows }) =>
        rows
          .filter((p) => (p.row.credit ?? 0) > 0)
          .forEach((p) =>
            p.errors.push(
              `New projects need ${totalNew} credit but the organization has ${orgRemaining} remaining`,
            ),
          ),
      );
    }

    return limits.map(({ name, limitCreditAllowance }) => ({
      name,
      limitCreditAllowance,
    }));
  }

  /** สูตรเดียวกับหน้า Project: max(creditAllowance, currentCycleBalance) + onTop − limit ที่แจกให้ project แล้ว */
  private async orgCreditRemaining(organizationId: string) {
    const [subscription, balance, projects] = await Promise.all([
      this.organizationSubscriptionRepo.findOne({ where: { organizationId } }),
      this.creditBalanceRepo.findOne({ where: { organizationId } }),
      this.projectRepo.findMany({
        where: { organizationId, AND: [NOT_DELETED_PROJECT] },
        select: { limitCreditAllowance: true },
      }),
    ]);
    // org event ได้ credit นอกแพ็กเกจ: creditAllowance = 0 แต่ credit จริงอยู่ใน currentCycleBalance
    const pool =
      Math.max(
        subscription?.creditAllowance ?? 0,
        balance?.currentCycleBalance ?? 0,
      ) + (balance?.onTopBalance ?? 0);
    const assigned = projects.reduce(
      (sum, p) => sum + (p.limitCreditAllowance ?? 0),
      0,
    );
    return pool - assigned;
  }

  private async sumAssignedCredit(projectIds: string[]) {
    const assigned = new Map<string, number>();
    if (!projectIds.length) return assigned;
    const members = await this.projectMemberRepo.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, limitCreditAllowance: true },
    });
    members.forEach((m) =>
      assigned.set(
        m.projectId,
        (assigned.get(m.projectId) ?? 0) + (m.limitCreditAllowance ?? 0),
      ),
    );
    return assigned;
  }

  private sumCredit(plans: RowPlan[]) {
    return plans.reduce((sum, p) => sum + (p.row.credit ?? 0), 0);
  }

  private key(name: string) {
    return name.trim().toLowerCase();
  }

  /** สร้าง project ใหม่ที่แถวใน chunk นี้อ้างถึง — คืน map ชื่อ (key) → projectId */
  private async createNewProjects(
    organizationId: string,
    plans: RowPlan[],
    newProjects: BulkNewProjectDto[],
  ) {
    const created = new Map<string, string>();
    const needed = new Set(
      plans.filter((p) => p.row.projectName).map((p) => this.key(p.row.projectName)),
    );
    for (const definition of newProjects) {
      const key = this.key(definition.name);
      if (!needed.has(key) || created.has(key)) continue;
      const project = await this.projectRepo.create({
        data: {
          name: definition.name.trim(),
          organizationId,
          limitCreditAllowance: definition.limitCreditAllowance,
          status: 'active',
        },
      });
      this.logger.log(
        `bulk-members: created project ${project.id} "${project.name}" limit=${definition.limitCreditAllowance} org=${organizationId}`,
      );
      created.set(key, project.id);
    }
    return created;
  }

  private async createRow(
    organizationId: string,
    plan: RowPlan,
    newProjectIds: Map<string, string>,
  ): Promise<BulkRowResult> {
    const { row } = plan;
    const projectId =
      row.projectId ||
      (row.projectName ? newProjectIds.get(this.key(row.projectName)) : '');
    const status: BulkRowStatus = plan.isNewUser ? 'NEW_USER' : 'EXISTING_USER';

    let keycloakId: string | null = null;
    try {
      if (plan.isNewUser) {
        keycloakId = await this.keycloakService.createUser({
          username: row.username,
          email: row.email,
          password: row.password,
          fullname: row.fullname,
        });
      }
      await this.transaction.execute(async (prisma) => {
        let userId = plan.userId;
        if (plan.isNewUser) {
          const user = await this.usersRepo.create(
            {
              data: {
                username: row.username,
                email: row.email,
                fullname: row.fullname,
                ...(row.phoneNumber && { phoneNumber: row.phoneNumber }),
                status: 'active',
                token: keycloakId,
                recentOrganizationId: organizationId,
              },
            },
            { prisma },
          );
          userId = user.userId;
        }
        if (plan.isNewOrgMember) {
          await this.organizationMemberRepo.create(
            {
              data: {
                organizationId,
                userId,
                role: row.role,
                maxImages: DEFAULT_MEMBER_QUOTA,
                maxToken: DEFAULT_MEMBER_QUOTA,
              },
            },
            { prisma },
          );
        }
        if (projectId) {
          await this.projectMemberRepo.create(
            {
              data: {
                projectId,
                userId,
                role: row.projectRole,
                limitCreditAllowance: row.credit ?? 0,
              },
            },
            { prisma },
          );
        }
      });
      this.logger.log(
        `bulk-members: row ${row.rowIndex} ${row.username} ${status} org=${organizationId} project=${projectId || '-'} credit=${row.credit ?? 0}`,
      );
      return { rowIndex: row.rowIndex, status, errors: [] };
    } catch (error) {
      const message = error?.message ?? 'Unknown error';
      this.logger.error(
        `bulk-members: row ${row.rowIndex} ${row.username} failed org=${organizationId}: ${message}`,
      );
      if (keycloakId) await this.rollbackKeycloakUser(keycloakId, row.username);
      return { rowIndex: row.rowIndex, status: 'ERROR', errors: [message] };
    }
  }

  private async rollbackKeycloakUser(keycloakId: string, username: string) {
    try {
      await this.keycloakService.deleteUser(keycloakId);
      this.logger.warn(
        `bulk-members: rolled back Keycloak user ${keycloakId} (${username})`,
      );
    } catch (error) {
      this.logger.error(
        `bulk-members: orphan Keycloak user ${keycloakId} (${username}) — rollback failed: ${error?.message}`,
      );
    }
  }
}
