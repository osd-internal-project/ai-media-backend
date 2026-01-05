import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditLogRepository {
    constructor(private prisma: PrismaService) { }

    async findAll(
        condition: Prisma.AuditLogFindManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.findMany(condition);
    }

    async findMany(
        condition: Prisma.AuditLogFindManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.findMany(condition);
    }

    async findOne(
        condition: Prisma.AuditLogFindFirstArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.findFirst(condition);
    }

    async create(
        condition: Prisma.AuditLogCreateArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.create(condition);
    }

    async createMany(
        data: Prisma.AuditLogCreateManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.createMany(data);
    }

    async update(
        data: Prisma.AuditLogUpdateArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.update(data);
    }

    async delete(
        condition: Prisma.AuditLogDeleteArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.delete(condition);
    }

    async deleteMany(
        condition: Prisma.AuditLogDeleteManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.deleteMany(condition);
    }

    async count(
        condition: Prisma.AuditLogCountArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.auditLog.count(condition);
    }
}
