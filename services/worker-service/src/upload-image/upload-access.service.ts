import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  AuthUser,
  OrganizationMemberRepository,
  ProjectMemberRepository,
  ProjectRepository,
  PromptGuideRepository,
} from '@ai-media/share';

const SUPER_ADMIN = 'SUPER_ADMIN';
/** role ใน org ที่เข้าได้ทุก project — กฎเดียวกับ ProjectService.checkUserRole ของ core */
const ORG_WIDE_ROLES = ['OWNER', 'ADMIN'];

export interface UploadTarget {
  organizationId?: string;
  projectId?: string;
  promptGuideId?: string | number;
}

/**
 * ใครเขียน/ลบไฟล์ใน org / project ไหนได้ — เดิมเชื่อ org/project/userId จาก client ทั้งหมด (audit C-1)
 * ไม่มี `user` (AUTH_MODE=off หรือ report ที่ไม่มี token) = ไม่ตรวจ เหมือนพฤติกรรมเดิม
 */
@Injectable()
export class UploadAccessService {
  constructor(
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly promptGuideRepo: PromptGuideRepository,
  ) {}

  /** @throws ForbiddenException เมื่อ user ไม่ใช่สมาชิก หรือ project/prompt guide ไม่ได้อยู่ใน org นั้น */
  async assertCanWrite(user: AuthUser | undefined, target: UploadTarget) {
    if (!user || user.role === SUPER_ADMIN) return;
    if (!target.organizationId) {
      throw new ForbiddenException('organizationId is required');
    }
    const member = await this.orgMemberRepo.findOne({
      where: {
        organizationId: target.organizationId,
        userId: user.userId,
        status: 'active',
      },
    });
    if (!member) {
      throw new ForbiddenException('Not a member of this organization');
    }
    if (target.projectId) {
      await this.assertProjectAccess(user, member.role, target.organizationId, target.projectId);
    }
    if (target.promptGuideId !== undefined && target.promptGuideId !== '') {
      const guide = await this.promptGuideRepo.findOne({
        where: { id: Number(target.promptGuideId) },
      });
      if (!guide || guide.organizationId !== target.organizationId) {
        throw new ForbiddenException('Prompt guide is not in this organization');
      }
    }
  }

  /** ลบ/ยืนยันไฟล์อ้างอิงของ project: เจ้าของไฟล์ หรือคนที่เข้าถึง project นั้นได้ */
  async assertCanManageRef(
    user: AuthUser | undefined,
    file: { userId: string; projectId: string },
  ) {
    if (!user || user.role === SUPER_ADMIN || this.owns(user, file.userId)) return;
    const project = await this.projectRepo.findOne({
      where: { id: file.projectId },
    });
    if (!project?.organizationId) throw new ForbiddenException('Not allowed');
    await this.assertCanWrite(user, {
      organizationId: project.organizationId,
      projectId: file.projectId,
    });
  }

  /** ลบ/ยืนยันรูปของ prompt guide: เจ้าของไฟล์ หรือสมาชิก org ของ prompt guide นั้น */
  async assertCanManagePromptGuideImage(
    user: AuthUser | undefined,
    file: { userId: string; promptGuideId: number | null },
  ) {
    if (!user || user.role === SUPER_ADMIN || this.owns(user, file.userId)) return;
    const guide = file.promptGuideId
      ? await this.promptGuideRepo.findOne({ where: { id: file.promptGuideId } })
      : null;
    if (!guide?.organizationId) throw new ForbiddenException('Not allowed');
    await this.assertCanWrite(user, { organizationId: guide.organizationId });
  }

  private async assertProjectAccess(
    user: AuthUser,
    orgRole: string,
    organizationId: string,
    projectId: string,
  ) {
    // กันส่ง org ของตัวเองคู่กับ project ของ org อื่น
    const project = await this.projectRepo.findOne({
      where: { id: projectId, status: { not: 'deleted' } },
    });
    if (!project || project.organizationId !== organizationId) {
      throw new ForbiddenException('Project is not in this organization');
    }
    if (ORG_WIDE_ROLES.includes(orgRole)) return;
    const projectMember = await this.projectMemberRepo.findOne({
      where: { projectId, userId: user.userId },
    });
    if (!projectMember) {
      throw new ForbiddenException('Not a member of this project');
    }
  }

  /** multipart body ผ่าน guard ไปก่อน multer parse — ตรวจ userId ที่อ้างใน body ตรงนี้แทน */
  assertSameUser(user: AuthUser | undefined, claimedUserId: string | undefined) {
    if (!user || user.role === SUPER_ADMIN || !claimedUserId) return;
    if (!this.owns(user, claimedUserId)) {
      throw new ForbiddenException('userId does not belong to the signed-in user');
    }
  }

  /** row เก่าเก็บ userId ทั้งแบบ users.userId และ users.token (sub) */
  private owns(user: AuthUser, fileUserId: string): boolean {
    return fileUserId === user.userId || fileUserId === user.token;
  }
}
