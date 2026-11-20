import { Prisma } from '@prisma/client';

export interface CreditPool {
  currentCycleBalance: number | null;
  onTopBalance: number | null;
}

export interface ProjectCredit {
  limitCreditAllowance: number | null;
  usedCreditAllowance: number | null;
}

/** Credit columns are double precision; compare caps at 2 decimals so 0.1 x 10 still equals 1 */
export const roundCredit = (value: number) => Math.round(value * 100) / 100;

/**
 * Credit an org can still hand to projects: balance left minus what projects may still spend.
 * Both sides are "remaining" amounts, so used credit is never subtracted twice. Negative = over-allocated.
 */
export function unallocatedCredit(
  pool: CreditPool | null,
  projects: ProjectCredit[],
): number {
  const balance = (pool?.currentCycleBalance ?? 0) + (pool?.onTopBalance ?? 0);
  const committed = projects.reduce(
    (sum, p) =>
      sum +
      Math.max((p.limitCreditAllowance ?? 0) - (p.usedCreditAllowance ?? 0), 0),
    0,
  );
  return roundCredit(balance - committed);
}

type UsageDb = Pick<Prisma.TransactionClient, 'project' | 'projectMember'>;

/**
 * New billing cycle: project and member limits are per-cycle caps, so used counters restart.
 * Holds stay (in-flight tasks settle later). Orgs without a plan allowance (event, SSO personal) keep usage.
 */
export async function resetCycleUsage(
  db: UsageDb,
  organizationId: string,
  creditAllowance: number | null | undefined,
): Promise<void> {
  if (!creditAllowance || creditAllowance <= 0) return;
  const data = { usedCreditAllowance: 0, usedImageAllowance: 0 };
  await db.projectMember.updateMany({
    where: { project: { organizationId } },
    data,
  });
  await db.project.updateMany({ where: { organizationId }, data });
}
