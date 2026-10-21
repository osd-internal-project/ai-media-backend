import { BadRequestException } from '@nestjs/common';
import { ProjectMemberLimitDto } from './dto/update-project.dto';

export interface ExistingMember {
  id: string;
  userId: string;
  role: string | null;
  limitCreditAllowance: number | null;
  usedCreditAllowance: number;
  holdCreditAllowance: number;
}

export interface NewMember {
  userId: string;
  role: string;
  limitCreditAllowance: number;
  limitImageAllowance: number;
}

export interface MemberChanges {
  update: { id: string; data: Omit<ProjectMemberLimitDto, 'userId'> }[];
  create: NewMember[];
  removeIds: string[];
}

/**
 * Diff the submitted member list against the stored rows so existing rows keep
 * their used/hold counters (recreating rows reset them to 0 — incident 2026-10-20).
 * @throws BadRequestException when the list breaks a credit rule
 */
export function planMemberChanges(
  existing: ExistingMember[],
  incoming: ProjectMemberLimitDto[],
  projectLimit: number,
): MemberChanges {
  const seen = new Set<string>();
  for (const member of incoming) {
    if (seen.has(member.userId)) {
      throw new BadRequestException(`Duplicate member ${member.userId}`);
    }
    seen.add(member.userId);
  }

  const byUser = new Map(existing.map((row) => [row.userId, row]));
  const changes: MemberChanges = { update: [], create: [], removeIds: [] };
  let assigned = 0;

  for (const member of incoming) {
    const row = byUser.get(member.userId);
    const limit = member.limitCreditAllowance ?? row?.limitCreditAllowance ?? 0;
    assigned += limit;

    if (!row) {
      changes.create.push({
        userId: member.userId,
        role: member.role ?? 'USER',
        limitCreditAllowance: limit,
        limitImageAllowance: member.limitImageAllowance ?? 0,
      });
      continue;
    }

    const spent = row.usedCreditAllowance + row.holdCreditAllowance;
    if (limit !== (row.limitCreditAllowance ?? 0) && limit < spent) {
      throw new BadRequestException(
        `Credit limit ${limit} for member ${member.userId} is below credit already used (${spent})`,
      );
    }
    changes.update.push({
      id: row.id,
      data: {
        role: member.role ?? row.role ?? 'USER',
        limitCreditAllowance: limit,
        ...(member.limitImageAllowance != null && {
          limitImageAllowance: member.limitImageAllowance,
        }),
      },
    });
  }

  for (const row of existing) {
    if (seen.has(row.userId)) continue;
    if (row.holdCreditAllowance > 0) {
      throw new BadRequestException(
        `Member ${row.userId} has a generation in progress and cannot be removed yet`,
      );
    }
    changes.removeIds.push(row.id);
  }

  if (assigned > projectLimit) {
    throw new BadRequestException(
      `Member credit limits (${assigned}) exceed the project limit (${projectLimit})`,
    );
  }
  return changes;
}
