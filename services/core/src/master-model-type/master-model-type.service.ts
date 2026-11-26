import {
  AuditLogRepository,
  AuthUser,
  changedFields,
  MasterdataModelTypeRepository,
  recordAdminAudit,
} from '@ai-media/share';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class MasterModelTypeService {
  constructor(
    private readonly masterModelTypeRepo: MasterdataModelTypeRepository,
    private readonly auditLogRepo: AuditLogRepository,
  ) {}

  async create(data: Prisma.MasterModelTypeCreateInput) {
    return this.masterModelTypeRepo.create({ data });
  }

  /** includeInactive ใช้ในหน้า AI Models ของ admin — client อื่นได้แค่ model ที่ active เหมือนเดิม */
  async findAll(includeInactive = false) {
    return this.masterModelTypeRepo.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    return this.masterModelTypeRepo.findOne({ where: { id, isActive: true } });
  }

  async update(
    id: number,
    data: Prisma.MasterModelTypeUpdateInput,
    authUser?: AuthUser,
  ) {
    const before = await this.masterModelTypeRepo.findOne({ where: { id } });
    const updated = await this.masterModelTypeRepo.update({
      where: { id },
      data,
    });
    if (before) {
      await recordAdminAudit(this.auditLogRepo, {
        userId: authUser?.userId,
        entityName: 'master_model_type',
        entityId: String(id),
        // body เป็นค่า field ตรง ๆ จากหน้า AI Models
        ...changedFields(before, data as Record<string, unknown>),
      });
    }
    return updated;
  }

  async remove(id: number) {
    return this.masterModelTypeRepo.delete({ where: { id } });
  }
}
