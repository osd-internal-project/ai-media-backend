import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogRepository } from '../repositories/auditLog.repository';

export type AdminAuditEntity = 'organization' | 'plan' | 'master_model_type';

export interface FieldChanges {
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

/** เฉพาะ field ใน patch ที่ค่าต่างจากเดิมจริง (เทียบแบบ JSON) */
export function changedFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): FieldChanges {
  const changes: FieldChanges = { oldValues: {}, newValues: {} };
  for (const [field, next] of Object.entries(patch)) {
    if (next === undefined) continue;
    const previous = before[field] ?? null;
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    changes.oldValues[field] = previous;
    changes.newValues[field] = next;
  }
  return changes;
}

/** ประวัติการแก้ของ admin — เขียนไม่สำเร็จแค่ log ไว้ ไม่ทำให้การบันทึกที่สำเร็จแล้วกลายเป็น error */
export async function recordAdminAudit(
  repo: AuditLogRepository,
  entry: { userId?: string; entityName: AdminAuditEntity; entityId: string } & FieldChanges,
): Promise<void> {
  if (Object.keys(entry.newValues).length === 0) return;
  try {
    await repo.create({
      data: {
        userId: entry.userId ?? 'unknown',
        action: 'UPDATE',
        entityName: entry.entityName,
        entityId: entry.entityId,
        oldValues: entry.oldValues as Prisma.InputJsonObject,
        newValues: entry.newValues as Prisma.InputJsonObject,
      },
    });
  } catch (error) {
    Logger.error(
      `audit ${entry.entityName}/${entry.entityId} not recorded: ${error instanceof Error ? error.message : String(error)}`,
      'AdminAudit',
    );
  }
}
