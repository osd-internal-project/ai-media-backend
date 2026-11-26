import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvitationRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
} from '@ai-media/share';

export interface SeatUsage {
  active: number;
  pending: number;
  /** null = ไม่จำกัด */
  max: number | null;
}

/** seat = สมาชิก active + คำเชิญ PENDING ที่ยังไม่หมดอายุ */
@Injectable()
export class OrganizationSeatService {
  constructor(
    private readonly organizationRepo: OrganizationRepository,
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private readonly invitationRepo: InvitationRepository,
  ) {}

  async usage(organizationId: string): Promise<SeatUsage> {
    const org = await this.organizationRepo.findOne({
      where: { organizationId },
      select: { maxUserAccess: true },
    });
    if (!org) throw new NotFoundException(`Organization ${organizationId} not found`);
    const [active, pending] = await Promise.all([
      this.organizationMemberRepo.count({
        where: { organizationId, status: 'active' },
      }),
      this.invitationRepo.count({
        where: { organizationId, status: 'PENDING', expiresAt: { gt: new Date() } },
      }),
    ]);
    return { active, pending, max: org.maxUserAccess ?? null };
  }

  /** เรียกก่อนเพิ่มคนใหม่เท่านั้น — สมาชิกเดิมที่เกิน limit อยู่แล้วไม่ถูกถอด */
  async assertAvailable(organizationId: string, adding: number): Promise<void> {
    const seat = await this.usage(organizationId);
    if (seat.max === null) return;
    const used = seat.active + seat.pending;
    if (used + adding > seat.max) {
      throw new ConflictException({
        code: 'SEAT_LIMIT_REACHED',
        message: `Seat limit reached: ${used} of ${seat.max} seats used (${seat.active} members + ${seat.pending} pending invites)`,
        seat,
      });
    }
  }
}
