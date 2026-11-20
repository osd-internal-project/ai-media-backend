import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthUser,
  CreditBalanceRepository,
  PrismaService,
  unallocatedCredit,
} from '@ai-media/share';

const SYSTEM_ADMIN_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];

@Injectable()
export class CreditBalanceService {
  constructor(
    private readonly creditBalanceRepo: CreditBalanceRepository,
    private readonly prisma: PrismaService,
  ) {}

  findOne(id: string) {
    return this.creditBalanceRepo.findOne({
      where: { id },
    });
  }

  findByOrganizationId(organizationId: string) {
    return this.creditBalanceRepo.findOne({
      where: { organizationId },
    });
  }

  /**
   * System admin adds (positive) or removes (negative) on-top credit. Removal is capped at
   * what is still unassigned and at the on-top left, so project limits already handed out stay spendable.
   * @throws ForbiddenException for non system admins; BadRequestException when removing too much
   */
  async updateExtraCoin(
    organizationId: string,
    data: { onTopBalance?: number; onTopImage?: number },
    authUser: AuthUser | undefined,
  ) {
    // trim ก่อนเทียบ — ข้อมูล role ในระบบมีค่าที่ติดช่องว่างท้ายอยู่จริง
    const role = authUser?.role?.trim();
    if (!role || !SYSTEM_ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Only a system administrator can change on-top credit',
      );
    }
    const credit = Number(data.onTopBalance ?? 0);
    const image = Number(data.onTopImage ?? 0);
    if (!Number.isFinite(credit) || !Number.isFinite(image)) {
      throw new BadRequestException('On-top amounts must be numbers');
    }

    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.creditBalance.findUnique({
        where: { organizationId },
      });
      if (!balance) throw new NotFoundException('Credit balance not found');
      const projects = await tx.project.findMany({
        where: {
          organizationId,
          OR: [{ status: null }, { status: { not: 'deleted' } }],
        },
        select: { limitCreditAllowance: true, usedCreditAllowance: true },
      });
      if (credit < 0) {
        const removable = Math.max(
          Math.min(unallocatedCredit(balance, projects), balance.onTopBalance),
          0,
        );
        if (-credit > removable) {
          throw new BadRequestException(
            `Can remove at most ${removable} on-top credit; the rest is already assigned to projects or not on-top`,
          );
        }
      }
      const updated = await tx.creditBalance.update({
        where: { id: balance.id },
        data: {
          onTopBalance: { increment: credit },
          onTopImage: { increment: image },
        },
      });
      return { ...updated, unallocated: unallocatedCredit(updated, projects) };
    });
  }
}
