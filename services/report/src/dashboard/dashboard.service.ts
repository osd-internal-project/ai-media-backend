import { Injectable, Logger } from '@nestjs/common';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import { generateExcelBuffer } from 'src/utils/excel';
// import { Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';
import {
  CreditBalanceRepository,
  GalleryRepository,
  LogRepository,
  OrganizationMemberRepository,
  OrganizationSubscriptionRepository,
  PrismaService,
  ProjectRepository,
  UsersRepository,
} from '@ai-media/share';

@Injectable()
export class DashboardService {
  constructor(
    private readonly logRepo: LogRepository,
    private readonly userRepo: UsersRepository,
    private readonly projectRepo: ProjectRepository,
    private readonly galleryRepo: GalleryRepository,
    private readonly organizationSubscriptionRepository: OrganizationSubscriptionRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly creditBalanceRepository: CreditBalanceRepository,
    private readonly prismaService: PrismaService,
  ) {}

  async findOverviewSummary(organizationId: string) {
    const totalProject = await this.projectRepo.count({
      where: { organizationId },
    });
    const totalActiveProject = await this.projectRepo.count({
      where: { organizationId, status: 'active' },
    });
    const member = await this.organizationMemberRepository.count({
      where: { organizationId },
    });
    const adminMember = await this.organizationMemberRepository.count({
      where: { organizationId, role: 'ADMIN' },
    });
    const countGenerate = await this.logRepo.aggregate({
      where: { project: { organizationId }, status: 'success' },
      _sum: {
        usedImage: true,
        usedCredit: true,
      },
    });
    const countGenerateThisMonth = await this.logRepo.aggregate({
      where: {
        project: { organizationId },
        createdAt: { gte: dayjs().startOf('month').toDate() },
        status: 'success',
      },
      _sum: {
        usedImage: true,
        usedCredit: true,
      },
    });
    const organizeSubscription =
      await this.organizationSubscriptionRepository.findOne({
        where: {
          organizationId,
        },
      });
    const creditBalance = await this.creditBalanceRepository.findOne({
      where: {
        organizationId,
      },
    });
    const usedCreditPercent =
      organizeSubscription?.creditAllowance &&
      organizeSubscription?.creditAllowance > 0
        ? ((organizeSubscription?.creditAllowance -
            (creditBalance?.currentCycleBalance || 0)) /
            organizeSubscription?.creditAllowance) *
          100
        : 0;
    // console.log( bnmbvvvb nusedCreditPercent);
    return {
      totalProject,
      totalActiveProject,

      //Users
      totalMember: member,
      adminMember: adminMember,
      // Overall Usage (Accessing Prisma's _sum object)
      usedImage: countGenerate._sum?.usedImage ?? 0,
      usedCredit: countGenerate._sum?.usedCredit ?? 0,

      // Monthly Usage
      monthlyusedImage: countGenerateThisMonth._sum?.usedImage ?? 0,
      monthlyusedCredit: countGenerateThisMonth._sum?.usedCredit ?? 0,

      // Subscription & Balance
      currentCycleBalance: creditBalance?.currentCycleBalance ?? 0,
      creditAllowance: organizeSubscription?.creditAllowance ?? 0,
      usedCreditPercent: usedCreditPercent,
    };
  }


  async countCreditPerMonthAndType(organizationId: string) {
    try {
      // Using $queryRaw with template tags automatically handles parameterization
      const result = await this.prismaService.$queryRaw`
        WITH months AS (
        -- Generate the last 6 months as a base table
        SELECT TO_CHAR(date_series, 'YYYY-MM') AS month_label
        FROM generate_series(
          CURRENT_DATE - INTERVAL '5 months', 
          CURRENT_DATE, 
          '1 month'
        ) AS date_series
      )
      SELECT 
        m.month_label AS "month",
        COALESCE(SUM(CASE WHEN l."type_generate" = 'image' THEN l.used_credit ELSE 0 END), 0)::FLOAT AS "image",
        COALESCE(SUM(CASE WHEN l."type_generate" = 'video' THEN l.used_credit ELSE 0 END), 0)::FLOAT AS "video",
        COALESCE(SUM(CASE WHEN l."type_generate" = 'omnihumen' THEN l.used_credit ELSE 0 END), 0)::FLOAT AS "omnihuman",
        COALESCE(SUM(CASE WHEN l."type_generate" = 'dreamactor' THEN l.used_credit ELSE 0 END), 0)::FLOAT AS "dreamactor"
      FROM months m
      LEFT JOIN log l ON TO_CHAR(l."created_at", 'YYYY-MM') = m.month_label
        AND l.status = 'success'
        AND l."project_id" IN (
          SELECT id FROM project WHERE organization_id = ${organizationId}
        )
      GROUP BY m.month_label
      ORDER BY m.month_label ASC;
      `;
      // Logger.debug(result);
      // this.logger.debug('Credit usage per month result:', result);
      return result;
    } catch (error) {
      Logger.error('Error fetching credit usage:', error);
      throw error;
    }
  }
  async countGeneratedPerMonthAndType(organizationId: string) {
    try {
      // Using $queryRaw with template tags automatically handles parameterization
      const result = await this.prismaService.$queryRaw`
        WITH months AS (
        -- Generate the last 6 months as a base table
        SELECT TO_CHAR(date_series, 'YYYY-MM') AS month_label
        FROM generate_series(
          CURRENT_DATE - INTERVAL '5 months', 
          CURRENT_DATE, 
          '1 month'
        ) AS date_series
      )
      SELECT 
        m.month_label AS "month",
        COALESCE(SUM(CASE WHEN l."type_generate" = 'image' THEN l.used_image ELSE 0 END), 0)::FLOAT AS "image",
        COALESCE(SUM(CASE WHEN l."type_generate" = 'video' THEN l.used_image ELSE 0 END), 0)::FLOAT AS "video",
        COALESCE(SUM(CASE WHEN l."type_generate" = 'omnihumen' THEN l.used_image ELSE 0 END), 0)::FLOAT AS "omnihuman",
        COALESCE(SUM(CASE WHEN l."type_generate" = 'dreamactor' THEN l.used_image ELSE 0 END), 0)::FLOAT AS "dreamactor"
      FROM months m
      LEFT JOIN log l ON TO_CHAR(l."created_at", 'YYYY-MM') = m.month_label
        AND l.status = 'success'
        AND l."project_id" IN (
          SELECT id FROM project WHERE organization_id = ${organizationId}
        )
      GROUP BY m.month_label
      ORDER BY m.month_label ASC;
      `;
      // Logger.debug(result);
      // this.logger.debug('Credit usage per month result:', result);
      return result;
    } catch (error) {
      Logger.error('Error fetching credit usage:', error);
      throw error;
    }
  }
  create(createDashboardDto: CreateDashboardDto) {
    return 'This action adds a new dashboard';
  }

  findAll() {
    return `This action returns all dashboard`;
  }
  async testExport(query: any, subject: string) {
    const { createdAt, projectId, token } = query || {};
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
              product === 'image' ? 0.03 : product === 'video' ? 0.0025 : null,
          };
        }
        const group = products[product];
        if (product === 'image') {
          group.totalImageUsed += log.ImageUsed ?? 0;
        }
        if (product === 'video') {
          group.totalTokenUsed += log.tokenUsed ?? 0;
        }
        return products;
      }, {}),
    );
    return generateExcelBuffer(result, subject);
  }
  findOne(id: number) {
    return `This action returns a #${id} dashboard`;
  }

  update(id: number, updateDashboardDto: UpdateDashboardDto) {
    return `This action updates a #${id} dashboard`;
  }

  remove(id: number) {
    return `This action removes a #${id} dashboard`;
  }
}
