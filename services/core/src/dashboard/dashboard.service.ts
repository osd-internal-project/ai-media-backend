import { Injectable, Logger } from '@nestjs/common';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import {
  LogRepository,
  OrganizationMemberRepository,
  ProjectMemberRepository,
  ProjectRepository,
  UsersRepository,
} from '@ai-media/share';
import { PrismaService } from '@ai-media/share';
import * as dayjs from 'dayjs';

@Injectable()
export class DashboardService {
  constructor(
    private readonly logRepo: LogRepository,
    private readonly userRepo: UsersRepository,
    private readonly prismaService: PrismaService,
    private readonly projectMemberRepo: ProjectMemberRepository,
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly projectRepo: ProjectRepository,
  ) {}
  async summaryProject(organizationId: string, query: any) {
    const { projectId, createdAt } = query || {};
    const projects = (await this.projectRepo.findMany({
      where: {
        organizationId: organizationId,
        ...(projectId && { id: projectId }),
      },
      select: {
        id: true,
        name: true,
        logs: {
          where: {
            status: 'success',
            ...(projectId && { projectId: projectId }),
            ...(createdAt && {
              createdAt: {
                gte: dayjs(createdAt).startOf('month').toDate(),
                lte: dayjs(createdAt).endOf('month').toDate(),
              },
            }),
            // typeGenerate: { in: ['vdo'] },
          },
          select: { tokenUsed: true, ImageUsed: true, typeGenerate: true },
        },
        members: {
          where: {
            ...(projectId && { projectId: projectId }),
            project: { organizationId: organizationId },
          },
          select: {
            userId: true,
            role: true,
            users: {
              select: {
                userId: true,
                fullname: true,
                logs: {
                  where: {
                    status: 'success',
                    ...(projectId && { projectId: projectId }),
                    ...(createdAt && {
                      createdAt: {
                        gte: dayjs(createdAt).startOf('month').toDate(),
                        lte: dayjs(createdAt).endOf('month').toDate(),
                      },
                    }),
                  },
                  select: {
                    tokenUsed: true,
                    ImageUsed: true,
                    projectId: true,
                    typeGenerate: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })) as any;

    return projects.map((project) => ({
      ...project,
      tokenUsed: project.logs
        .filter((log) => log.typeGenerate === 'vdo')
        .reduce(
          (sum, logs) => sum + (logs.tokenUsed ? Number(logs.tokenUsed) : 0),
          0,
        ),
      imageUsed: project.logs
        .filter((log) => log.typeGenerate === 'image')
        .reduce(
          (sum, logs) => sum + (logs.ImageUsed ? Number(logs.ImageUsed) : 0),
          0,
        ),
      members: project.members.map((member) => {
        const memberLogs = member.users.logs.filter(
          (log) => log.projectId === project.id,
        );
        return {
          ...member,
          project: {
            logs: memberLogs,
          },
          tokenUsed: memberLogs
            .filter((log) => log.typeGenerate === 'vdo')
            .reduce(
              (sum, log) => sum + (log.tokenUsed ? Number(log.tokenUsed) : 0),
              0,
            ),
          imageUsed: memberLogs
            .filter((log) => log.typeGenerate === 'image')
            .reduce(
              (sum, log) => sum + (log.ImageUsed ? Number(log.ImageUsed) : 0),
              0,
            ),
          users: {
            ...member.users,
            logs: undefined,
          },
        };
      }),
    }));
  }
  async summaryUser(organizationId: string, query: any) {
    const { projectId, createdAt } = query || {};
    const sql = `
select
	om.user_id,
	om.role,fullname,username,
	COALESCE(lg.image_used,0) as "imageUsed",
	COALESCE(lg.token_used,0) as "tokenUsed"
from
	(
	select
		om.user_id  as user_id,
		om.role as role,
		u.fullname,
		u.username
	from
		organization_member om left join users u on u."userId" = om.user_id 
	where
		organization_id = '${organizationId}' ) om
left join 
	(
	select
		log."userId"  as user_id ,
		SUM(CASE WHEN log."typeGenerate" = 'image' THEN log."ImageUsed" ELSE 0 END) as image_used,
		SUM(CASE WHEN log."typeGenerate" = 'vdo' THEN log."tokenUsed" ELSE 0 END) as token_used
	from
		log
	left join project on
		log."projectId" = project.id where log.status='success' and project.organization_id = '${organizationId}' ${
      projectId ? `and log."projectId" = '${projectId}'` : ''
    } ${
      createdAt
        ? `and log."createdAt" between '${dayjs(createdAt)
            .startOf('month')
            .toISOString()}' and '${dayjs(createdAt)
            .endOf('month')
            .toISOString()}'`
        : ''
    } group by log."userId" ) lg on
	om.user_id = lg.user_id order by fullname`;
    // console.log(sql);
    const result = await this.prismaService.$queryRawUnsafe(sql);

    return result || [];
  }

  async findSummaryDashboard(token: string, query: any) {
    const { projectId, createdAt } = query || {};

    const findUser = (await this.userRepo.findOne({
      where: { token },
      include: {
        groups: {
          include: {
            group: {
              select: {
                name: true,
                displayName: true,
                id: true,
              },
            },
          },
        },
      },
    })) as any;
    const isAdmin = findUser.groups.some(
      (g: any) => g.group?.name === 'admin-user',
    );
    const initialPriceImage = 0.03;
    const initialPriceVideo = 0.0025;
    const sumBy = (arr, key) =>
      arr.reduce((sum, item) => sum + (item[key] || 0), 0);
    const betweenDates = (start, end) => ({
      gte: start.toDate(),
      lte: end.toDate(),
    });
    const dataLogs = await this.logRepo.findMany({
      where: {
        ...(!isAdmin && { userId: findUser.userId }),
        status: 'success',
        taskId: { not: null },
        ...(projectId && { projectId: projectId }),
        ...(createdAt && {
          createdAt: {
            gte: dayjs(createdAt).startOf('month').toDate(),
            lte: dayjs(createdAt).endOf('month').toDate(),
          },
        }),
      },
    });
    let quota = 0;

    if (isAdmin) {
      const allUsers = await this.userRepo.findMany({});
      quota = allUsers.reduce((sum, user: any) => {
        const priceImage = user.maxImages * initialPriceImage;
        const priceToken = user.maxToken * initialPriceVideo;
        return sum + priceImage + priceToken;
      }, 0);
    } else {
      const priceImage = findUser.maxImages * initialPriceImage;
      const priceToken = findUser.maxToken * initialPriceVideo;
      quota = priceImage + priceToken;
    }
    const totalTokenUsed = sumBy(
      dataLogs.filter((log) => log.typeGenerate === 'vdo'),
      'tokenUsed',
    );
    const totalImageUsed = sumBy(
      dataLogs.filter((log) => log.typeGenerate === 'image'),
      'ImageUsed',
    );
    const summarPriceImageUsed = totalImageUsed * initialPriceImage;
    const summarPriceTokenUsed = (totalTokenUsed / 1000) * initialPriceVideo;
    const summaryUsed = summarPriceImageUsed + summarPriceTokenUsed;
    const todayRange = betweenDates(
      dayjs().startOf('month'),
      dayjs().endOf('month'),
    );
    const lastMonthStart = dayjs().subtract(1, 'month').startOf('month');
    const lastMonthEnd = dayjs().subtract(1, 'month').endOf('month');
    const lastMonthRange = betweenDates(lastMonthStart, lastMonthEnd);
    const [dataLogsDateNow, dataLogsDateLast] = await Promise.all([
      this.logRepo.findMany({
        where: {
          ...(!isAdmin && { userId: findUser.userId }),
          ...(projectId && { projectId: projectId }),
          createdAt: todayRange,
          status: 'success',
          taskId: { not: null },
        },
      }),
      this.logRepo.findMany({
        where: {
          ...(!isAdmin && { userId: findUser.userId }),
          ...(projectId && { projectId: projectId }),
          createdAt: lastMonthRange,
          status: 'success',
          taskId: { not: null },
        },
      }),
    ]);
    const totalImageUsedDateNow = sumBy(dataLogsDateNow, 'ImageUsed');
    const totalTokenUsedDateNow = sumBy(
      dataLogsDateNow.filter((log) => log.typeGenerate === 'vdo'),
      'tokenUsed',
    );
    const totalPriceUsedImageDateNow =
      totalImageUsedDateNow * initialPriceImage;
    const totalPriceUsedVdoDateNow =
      (totalTokenUsedDateNow / 1000) * initialPriceVideo;
    const sumPriceTokenUsedDateNow =
      totalPriceUsedImageDateNow + totalPriceUsedVdoDateNow;
    const totalImageUsedDateLast = sumBy(dataLogsDateLast, 'ImageUsed');
    const totalTokenUsedDateLast = sumBy(
      dataLogsDateLast.filter((log) => log.typeGenerate === 'vdo'),
      'tokenUsed',
    );
    const totalPriceUsedImageDateLast =
      totalImageUsedDateLast * initialPriceImage;
    const totalPriceUsedVdoDateLast =
      (totalTokenUsedDateLast / 1000) * initialPriceVideo;
    const sumPriceTokenUsedDateLast =
      totalPriceUsedImageDateLast + totalPriceUsedVdoDateLast;

    const data = {
      quota: quota,
      summaryUsed,
      sumPriceTokenUsedDateNow,
      sumPriceTokenUsedDateLast,
    };

    return data;
  }
  async findOwnerTableDashboard(token, query) {
    const { projectId, createdAt } = query || {};
    const findUser = (await this.userRepo.findOne({
      where: { token },
      include: {
        groups: {
          include: {
            group: {
              select: {
                name: true,
                displayName: true,
                id: true,
              },
            },
          },
        },
      },
    })) as any;
    const isAdmin = findUser.groups.some(
      (g: any) => g.group?.name === 'admin-user',
    );
    const dataLogs = await this.logRepo.findMany({
      where: {
        ...(!isAdmin && { userId: findUser.userId }),
        status: 'success',
        taskId: { not: null },
        ...(projectId && { projectId: projectId }),
        ...(createdAt && {
          createdAt: {
            gte: dayjs(createdAt).startOf('month').toDate(),
            lte: dayjs(createdAt).endOf('month').toDate(),
          },
        }),
      },
      include: {
        users: true,
      },
    });

    const result = Object.values(
      dataLogs.reduce((owners, log: any) => {
        const ownerName = log.users.fullname;
        const product = log.typeGenerate;

        if (!owners[ownerName]) {
          owners[ownerName] = {
            owner: ownerName,
            products: {},
          };
        }

        if (!owners[ownerName].products[product]) {
          owners[ownerName].products[product] = {
            type: product, // เปลี่ยนจาก product เป็น type
            totalImageUsed: 0,
            totalTokenUsed: 0,
            unitPrice:
              product === 'image' ? 0.03 : product === 'vdo' ? 0.0025 : null,
          };
        }

        const group = owners[ownerName].products[product];

        if (product === 'image') {
          group.totalImageUsed += log.ImageUsed ?? 0;
        }
        if (product === 'vdo') {
          group.totalTokenUsed += log.tokenUsed ?? 0;
        }
        return owners;
      }, {}),
    ).map((owner: any) => ({
      ...owner,
      products: Object.values(owner.products),
    }));

    return result;
  }

  async findProductTableDashboard(token, query) {
    const { projectId, createdAt } = query || {};
    const findUser = (await this.userRepo.findOne({
      where: { token },
      include: {
        groups: {
          include: {
            group: {
              select: {
                name: true,
                displayName: true,
                id: true,
              },
            },
          },
        },
      },
    })) as any;
    const isAdmin = findUser.groups.some(
      (g: any) => g.group?.name === 'admin-user',
    );
    const dataLogs = await this.logRepo.findMany({
      where: {
        ...(!isAdmin && { userId: findUser.userId }),
        status: 'success',
        taskId: { not: null },
        ...(projectId && { projectId: projectId }),
        ...(createdAt && {
          createdAt: {
            gte: dayjs(createdAt).startOf('month').toDate(),
            lte: dayjs(createdAt).endOf('month').toDate(),
          },
        }),
      },
      include: {
        users: true,
      },
    });
    const result = Object.values(
      dataLogs.reduce((products, log: any) => {
        const product = log.typeGenerate;
        if (!products[product]) {
          products[product] = {
            type: product,
            totalImageUsed: 0,
            totalTokenUsed: 0,
            unitPrice:
              product === 'image' ? 0.03 : product === 'vdo' ? 0.0025 : null,
          };
        }
        const group = products[product];
        if (product === 'image') {
          group.totalImageUsed += log.ImageUsed ?? 0;
        }
        if (product === 'vdo') {
          group.totalTokenUsed += log.tokenUsed ?? 0;
        }
        return products;
      }, {}),
    );

    return result;
  }
}
