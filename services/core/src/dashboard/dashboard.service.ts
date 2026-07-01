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
    private readonly organizationMemberRepo: OrganizationMemberRepository,
    private readonly projectRepo: ProjectRepository,
  ) {}
  async summaryOrganization(organizationId: string, query: any) {
    const { createdAt } = query || {};
    const sql = ` select o.id as "organizationId", o.name as "organizationName",
      (COALESCE(sub.image_allowance, 0) + COALESCE(cb.on_top_image, 0))::int as "packageImageAmount",
      (COALESCE(sub.credit_allowance, 0) + COALESCE(cb.on_top_balance, 0))::int as "packageTokenAmount", 
      (COALESCE(cb.current_cycle_image, 0) + COALESCE(cb.on_top_image, 0))::int as "remainImageAmount",
      (COALESCE(cb.current_cycle_balance, 0) + COALESCE(cb.on_top_balance, 0))::int as "remainTokenAmount" from organization o 
    left join organization_subscriptions sub on o.organization_id = sub.organization_id
    left join credit_balances cb on o.organization_id = cb.organization_id
     where ${
       organizationId ? `o.organization_id  = '${organizationId}'` : ''
     } `;
    // console.log(sql);
    const result: any = await this.prismaService.$queryRawUnsafe(sql);
    if (result && result.length > 0) {
      return result[0];
    }
    return {};
  }
  async summaryProject(organizationId: string, query: any) {
    const { projectId, createdAt } = query || {};
    const projects = (await this.projectRepo.findMany({
      where: {
        organizationId: organizationId,
        ...(projectId && { id: projectId }),
        logs: {
          some: {
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
        },
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
          select: {
            typeGenerate: true,
            usedCredit: true,
            usedImage: true,
          },
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
                    // usedCredit: true,
                    // usedImage: true,
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
      usedCredit: project.logs
        .filter((log) => log.typeGenerate !== 'image')
        .reduce(
          (sum, logs) => sum + (logs.usedCredit ? Number(logs.usedCredit) : 0),
          0,
        ),
      imageUsed: project.logs
        .filter((log) => log.typeGenerate === 'image')
        .reduce(
          (sum, logs) => sum + (logs.usedImage ? Number(logs.usedImage) : 0),
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
          usedCredit: memberLogs
            .filter((log) => log.typeGenerate !== 'image')
            .reduce(
              (sum, log) => sum + (log.usedCredit ? Number(log.usedCredit) : 0),
              0,
            ),
          imageUsed: memberLogs
            .filter((log) => log.typeGenerate === 'image')
            .reduce(
              (sum, log) => sum + (log.usedImage ? Number(log.usedImage) : 0),
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
	COALESCE(lg.used_image,0) as "usedImage",
	COALESCE(lg.used_credit,0) as "usedCredit"
from
	(
	select
		om.user_id  as user_id,
		om.role as role,
		u.fullname,
		u.username
	from
		organization_member om left join users u on u."user_id" = om.user_id
	where
		organization_id = '${organizationId}' ) om
left join 
	(
	select
		log."user_id"  as user_id ,
		SUM(CASE WHEN log."type_generate" = 'image' THEN log.used_image ELSE 0 END) as used_image,
		SUM(CASE WHEN log."type_generate" != 'image' THEN log.used_credit ELSE 0 END) as used_credit
	from
		log
	left join project on
		log."project_id" = project.id where log.status='success' and project.organization_id = '${organizationId}' ${
      projectId ? `and log."project_id" = '${projectId}'` : ''
    } ${
      createdAt
        ? `and log."created_at" between '${dayjs(createdAt)
            .startOf('month')
            .toISOString()}' and '${dayjs(createdAt)
            .endOf('month')
            .toISOString()}'`
        : ''
    } group by log."user_id" ) lg on
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
      dataLogs.filter((log) => log.typeGenerate === 'video'),
      'usedCredit',
    );
    const totalusedImage = sumBy(
      dataLogs.filter((log) => log.typeGenerate === 'image'),
      'usedImage',
    );
    const summarPriceusedImage = totalusedImage * initialPriceImage;
    const summarPriceTokenUsed = (totalTokenUsed / 1000) * initialPriceVideo;
    const summaryUsed = summarPriceusedImage + summarPriceTokenUsed;
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
    const totalusedImageDateNow = sumBy(dataLogsDateNow, 'usedImage');
    const totalTokenUsedDateNow = sumBy(
      dataLogsDateNow.filter((log) => log.typeGenerate === 'video'),
      'usedCredit',
    );
    const totalPriceUsedImageDateNow =
      totalusedImageDateNow * initialPriceImage;
    const totalPriceUsedVdoDateNow =
      (totalTokenUsedDateNow / 1000) * initialPriceVideo;
    const sumPriceTokenUsedDateNow =
      totalPriceUsedImageDateNow + totalPriceUsedVdoDateNow;
    const totalusedImageDateLast = sumBy(dataLogsDateLast, 'usedImage');
    const totalTokenUsedDateLast = sumBy(
      dataLogsDateLast.filter((log) => log.typeGenerate === 'video'),
      'usedCredit',
    );
    const totalPriceUsedImageDateLast =
      totalusedImageDateLast * initialPriceImage;
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
            totalusedImage: 0,
            totalTokenUsed: 0,
            unitPrice:
              product === 'image' ? 0.03 : product === 'video' ? 0.0025 : null,
          };
        }

        const group = owners[ownerName].products[product];

        if (product === 'image') {
          group.totalusedImage += log.usedImage ?? 0;
        }
        if (product === 'video') {
          group.totalTokenUsed += log.usedCredit ?? 0;
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
            totalusedImage: 0,
            totalTokenUsed: 0,
            unitPrice:
              product === 'image' ? 0.03 : product === 'video' ? 0.0025 : null,
          };
        }
        const group = products[product];
        if (product === 'image') {
          group.totalusedImage += log.usedImage ?? 0;
        }
        if (product === 'video') {
          group.totalTokenUsed += log.usedCredit ?? 0;
        }
        return products;
      }, {}),
    );

    return result;
  }
}
