import { PrismaService } from '../modules/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { TQueryClient } from '../modules/prisma/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvitationRepository {
    constructor(private prisma: PrismaService) { }
    async findAll(
        condition: Prisma.InvitationFindManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.findMany(condition);
    }
    async findMany(
        condition: Prisma.InvitationFindManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.findMany(condition);
    }
    async findOne(
        condition: Prisma.InvitationFindFirstArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.findFirst(condition);
    }
    async create(
        condition: Prisma.InvitationCreateArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.create(condition);
    }
    async createMany(
        data: Prisma.InvitationCreateManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.createMany(data);
    }
    async update(
        data: Prisma.InvitationUpdateArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.update(data);
    }
    async updatemany(
        data: Prisma.InvitationUpdateManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.updateMany(data);
    }
    async delete(
        condition: Prisma.InvitationDeleteArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.delete(condition);
    }
    async deleteMany(
        condition: Prisma.InvitationDeleteManyArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.deleteMany(condition);
    }

    async count(
        condition: Prisma.InvitationCountArgs,
        option?: { prisma?: TQueryClient },
    ) {
        const prisma = option?.prisma ?? this.prisma;
        return prisma.invitation.count(condition);
    }
}
