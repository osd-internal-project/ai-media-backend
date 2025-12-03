import { Injectable } from '@nestjs/common';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { LogRepository, UsersRepository } from '@ai-media/share';
import * as dayjs from 'dayjs';

@Injectable()
export class DashboardService {
  constructor(
    private readonly logRepo: LogRepository,
    private readonly userRepo: UsersRepository,
  ) {}
  async findSummaryDashboard(token: string, query: any) {
    const { projectId, createdAt } = query || {};

    const findUser = await this.userRepo.findOne({ where: { token } });
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
        userId: findUser.userId,
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
    const summaryPriceImage = findUser.maxImages * initialPriceImage;
    const summaryPriceToken = findUser.maxToken * initialPriceVideo;
    const quota = summaryPriceImage + summaryPriceToken;
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
          userId: findUser.userId,
          createdAt: todayRange,
          status: 'success',
          taskId: { not: null },
        },
      }),
      this.logRepo.findMany({
        where: {
          userId: findUser.userId,
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
    const findUser = await this.userRepo.findOne({ where: { token } });
    const dataLogs = await this.logRepo.findMany({
      where: {
        userId: findUser.userId,
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
    const findUser = await this.userRepo.findOne({ where: { token } });
    const dataLogs = await this.logRepo.findMany({
      where: {
        userId: findUser.userId,
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
