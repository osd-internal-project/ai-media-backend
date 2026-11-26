export interface Entitlements {
  accessCodes: string[] | null;
  allowedModelIds: number[] | null;
}

export interface OrgEntitlements extends Entitlements {
  organizationId: string;
}

/** เทียบแบบ set — แถวเดิมไม่ได้ sort และ null ของแถวเก่าเท่ากับว่าง */
function sameSet<T>(a: T[] | null, b: T[] | null): boolean {
  const left = new Set(a ?? []);
  const right = new Set(b ?? []);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function matchesPlan(org: Entitlements, plan: Entitlements): boolean {
  return (
    sameSet(org.accessCodes, plan.accessCodes) &&
    sameSet(org.allowedModelIds, plan.allowedModelIds)
  );
}
