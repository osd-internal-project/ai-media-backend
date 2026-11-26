import { BadRequestException } from '@nestjs/common';
import { Entitlements, matchesPlan, OrgEntitlements } from '@ai-media/share';

export const APPLY_SCOPES = ['matching', 'all', 'none'] as const;
export type ApplyScope = (typeof APPLY_SCOPES)[number];

/** ไม่ส่งมา = `none` — client เดิมที่ PATCH /plans ต้องไม่เปลี่ยน org ไหนเลย */
export function parseApplyScope(value: unknown): ApplyScope {
  if (value === undefined || value === null) return 'none';
  if (APPLY_SCOPES.includes(value as ApplyScope)) return value as ApplyScope;
  throw new BadRequestException(
    `applyToOrganizations must be one of: ${APPLY_SCOPES.join(', ')}`,
  );
}

/** `matching` = org ที่ค่ายังเท่ากับค่าของ plan ก่อนแก้ (ไม่ทับ org ที่ admin กำหนดเอง) */
export function pickTargets(
  orgs: OrgEntitlements[],
  planBefore: Entitlements,
  scope: ApplyScope,
): string[] {
  if (scope === 'none') return [];
  const targets = scope === 'all' ? orgs : orgs.filter((org) => matchesPlan(org, planBefore));
  return targets.map((org) => org.organizationId);
}
