import { Injectable, Logger } from '@nestjs/common';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import {
  DashboardFilterDto,
  DashboardGranularity,
  DashboardMetric,
} from './dto/dashboard-filter.dto';
import { generateExcelBuffer } from 'src/utils/excel';
import { Prisma } from '@prisma/client';
import * as dayjs from 'dayjs';
import {
  CreditBalanceRepository,
  GalleryRepository,
  GENERATION_TYPES,
  LogRepository,
  OrganizationMemberRepository,
  OrganizationSubscriptionRepository,
  PrismaService,
  ProjectRepository,
  toGenerationTypeKey,
  UsersRepository,
} from '@ai-media/share';

/** Buckets are labelled in UTC so JS-side labels and Postgres TO_CHAR always agree. */
type ResolvedRange = {
  from: Date;
  to: Date;
  granularity: DashboardGranularity;
};

/** Hard ceiling on generated buckets so a pathological range cannot blow up the query. */
const MAX_BUCKETS = 400;

/** Default lookback when the caller supplies no range (preserves the previous 6-month view). */
const DEFAULT_LOOKBACK_MONTHS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Row shape returned by the recent-generations query.
 *
 * `LogRepository.findMany` accepts a non-generic `Prisma.LogFindManyArgs`, so its return type
 * collapses to the bare `Log` payload and drops the `select`ed relations. This describes what
 * the query actually returns.
 */
type RecentGenerationRow = {
  id: string;
  taskId: string | null;
  typeGenerate: string | null;
  prompt: string;
  usedCredit: number | null;
  usedImage: number | null;
  createdAt: Date;
  project: { id: string; name: string } | null;
  users: { userId: string; fullname: string; username: string } | null;
};

@Injectable()
export class DashboardService {
  /**
   * Only completed generations are reported. Logs are created as `pending` by the core
   * service and flipped to `success` by the worker, so in-flight jobs are deliberately
   * excluded — every dashboard surface shares this constant so they cannot disagree.
   */
  private readonly SUCCESS_STATUS = 'success';

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

  /**
   * The single `where` every generation figure on the dashboard is built from.
   *
   * The stat cards, the trend series and the recent-generations list all derive their row
   * set from this one place, which is what guarantees they cannot report different numbers
   * for the same filter.
   *
   * @param organizationId Organization UUID (`Organization.organizationId`).
   * @param filter Parsed request filter.
   * @returns A Prisma `where` clause over the `Log` model.
   */
  private buildLogWhere(
    organizationId: string,
    filter: DashboardFilterDto = {},
  ): Prisma.LogWhereInput {
    const { from, to } = this.resolveRange(filter);

    return {
      status: this.SUCCESS_STATUS,
      project: {
        organizationId,
        ...(filter.projectId && { id: filter.projectId }),
      },
      createdAt: { gte: from, lte: to },
    };
  }

  /**
   * Normalises the request filter into a concrete UTC range and bucket width.
   *
   * Timestamps are parsed as UTC (not server-local) because `log.created_at` is a naive
   * `TIMESTAMP(3)` holding UTC wall-clock, so this keeps Prisma's `where`, the raw SQL and
   * the JS-generated bucket labels aligned.
   *
   * @param filter Raw request filter.
   * @returns Inclusive `from`/`to` boundaries plus the granularity to bucket by.
   */
  private resolveRange(filter: DashboardFilterDto = {}): ResolvedRange {
    const parsedTo = this.parseDate(filter.to);
    const parsedFrom = this.parseDate(filter.from);

    const to = parsedTo ?? new Date();
    const fallbackFrom = new Date(
      Date.UTC(
        to.getUTCFullYear(),
        to.getUTCMonth() - DEFAULT_LOOKBACK_MONTHS,
        1,
      ),
    );
    let from = parsedFrom ?? fallbackFrom;

    // A reversed range would loop forever while generating buckets.
    if (from.getTime() > to.getTime()) {
      from = new Date(
        Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
      );
    }

    const spanDays = (to.getTime() - from.getTime()) / MS_PER_DAY;
    const granularity: DashboardGranularity =
      filter.granularity ?? (spanDays <= 31 ? 'day' : 'month');

    return { from, to, granularity };
  }

  /**
   * Parses an ISO timestamp, treating a bare (offset-less) timestamp as UTC.
   *
   * `log.created_at` is a naive `TIMESTAMP(3)` holding UTC wall-clock, so parsing as UTC is
   * what keeps Prisma's `where`, the raw SQL and the JS-generated bucket labels aligned.
   *
   * @param value Raw ISO 8601 string from the request, if any.
   * @returns A Date, or null when absent or unparseable.
   */
  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
    const parsed = new Date(hasZone ? value : `${value}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Generates every bucket label in the range, including empty ones, so the chart renders a
   * continuous x-axis instead of only the buckets that happen to have data.
   *
   * @param range Resolved range and granularity.
   * @returns Ordered `YYYY-MM-DD` (day) or `YYYY-MM` (month) labels, in UTC.
   */
  private buildBucketLabels(range: ResolvedRange): string[] {
    const byDay = range.granularity === 'day';
    const sliceEnd = byDay ? 10 : 7;
    const toLabel = (date: Date) => date.toISOString().slice(0, sliceEnd);
    const endLabel = toLabel(range.to);
    const labels: string[] = [];

    let cursor = new Date(
      Date.UTC(
        range.from.getUTCFullYear(),
        range.from.getUTCMonth(),
        byDay ? range.from.getUTCDate() : 1,
      ),
    );

    while (labels.length < MAX_BUCKETS) {
      const label = toLabel(cursor);
      labels.push(label);
      if (label >= endLabel) break;
      cursor = new Date(
        Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth() + (byDay ? 0 : 1),
          cursor.getUTCDate() + (byDay ? 1 : 0),
        ),
      );
    }

    return labels;
  }

  /**
   * Aggregate figures behind the four Overview stat cards.
   *
   * @param organizationId Organization UUID.
   * @param filter Date range / project scope. Generation figures respect it; project and
   *   member counts are point-in-time by design so they stay identical to the Users and
   *   Projects tab badges.
   * @returns Counts, range-scoped usage, and the credit quota breakdown.
   */
  async findOverviewSummary(
    organizationId: string,
    filter: DashboardFilterDto = {},
  ) {
    const logWhere = this.buildLogWhere(organizationId, filter);

    // Soft-deleted projects are excluded so this matches the Projects tab, which filters
    // `status != 'deleted'`.
    const totalProject = await this.projectRepo.count({
      where: { organizationId, status: { not: 'deleted' } },
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
    // Range-scoped figures — these share `logWhere` with the trend series and the recent
    // generations list, so all three always describe the same set of rows.
    const generationCount = await this.logRepo.count({ where: logWhere });
    const rangeUsage = await this.logRepo.aggregate({
      where: logWhere,
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

    // Quota = this cycle's allowance plus any purchased/coupon top-up, so redeeming a
    // coupon correctly increases headroom instead of pushing usage past 100%.
    const creditAllowance = organizeSubscription?.creditAllowance ?? 0;
    const currentCycleBalance = creditBalance?.currentCycleBalance ?? 0;
    const onTopBalance = creditBalance?.onTopBalance ?? 0;
    const quotaTotal = creditAllowance + onTopBalance;
    const quotaRemaining = currentCycleBalance + onTopBalance;
    const quotaUsed = Math.max(0, quotaTotal - quotaRemaining);
    const usedCreditPercent =
      quotaTotal > 0 ? Math.min(100, (quotaUsed / quotaTotal) * 100) : 0;

    const range = this.resolveRange(filter);

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

      // Selected range
      generationCount,
      rangeUsedImage: rangeUsage._sum?.usedImage ?? 0,
      rangeUsedCredit: rangeUsage._sum?.usedCredit ?? 0,
      rangeFrom: range.from.toISOString(),
      rangeTo: range.to.toISOString(),

      // Subscription & Balance
      currentCycleBalance,
      creditAllowance,
      onTopBalance,
      quotaTotal,
      quotaRemaining,
      quotaUsed,
      usedCreditPercent,
    };
  }


  /**
   * Per-bucket, per-type generation series that drives both the trend chart and the "By Type"
   * donut (the donut is summed from this same payload on the client).
   *
   * The row set is pinned to the *same* predicates as {@link buildLogWhere} — success only,
   * the org's projects, the optional project scope, and an explicit `created_at` range — so a
   * bucket total can never disagree with the stat card. The bucket list is generated in JS and
   * fed in as a VALUES clause, which keeps empty buckets in the output and avoids relying on
   * the database session timezone.
   *
   * @param organizationId Organization UUID.
   * @param filter Range, project scope and metric.
   * @returns One row per bucket: `{ bucket, image, video, omnihuman, dreamactor }`.
   */
  async findGenerationSeries(
    organizationId: string,
    filter: DashboardFilterDto = {},
  ) {
    const range = this.resolveRange(filter);
    const metric: DashboardMetric = filter.metric ?? 'credit';
    const bucketFormat = range.granularity === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    const labels = this.buildBucketLabels(range);

    // Column aliases and the matched literals both come from GENERATION_TYPES, never from
    // request input, so there is no injection surface in the interpolated identifiers.
    const columns = GENERATION_TYPES.map(
      (type) =>
        Prisma.sql`${this.metricExpression(metric, type.dbValue)}::FLOAT AS ${Prisma.raw(`"${type.key}"`)}`,
    );

    // The ::text cast is required — Postgres cannot infer the type of a bare parameter
    // inside a VALUES list, and would reject the query with "could not determine data type".
    const bucketValues = Prisma.join(
      labels.map((label) => Prisma.sql`(${label}::text)`),
      ', ',
    );

    try {
      const result = await this.prismaService.$queryRaw<
        Record<string, string | number>[]
      >`
        WITH buckets("bucket") AS (VALUES ${bucketValues})
        SELECT
          b."bucket" AS "bucket",
          ${Prisma.join(columns, ', ')}
        FROM buckets b
        LEFT JOIN log l
          ON TO_CHAR(l."created_at", ${bucketFormat}) = b."bucket"
          AND l.status = ${this.SUCCESS_STATUS}
          AND l."created_at" >= ${range.from}
          AND l."created_at" <= ${range.to}
          AND l."project_id" IN (
            SELECT id FROM project
            WHERE organization_id = ${organizationId}
            ${filter.projectId ? Prisma.sql`AND id = ${filter.projectId}` : Prisma.empty}
          )
        GROUP BY b."bucket"
        ORDER BY b."bucket" ASC;
      `;
      return result;
    } catch (error) {
      Logger.error('Error fetching generation series:', error);
      throw error;
    }
  }

  /**
   * Builds the aggregate expression for one generation type.
   *
   * @param metric Which quantity to report.
   * @param dbValue The database literal for the type (from GENERATION_TYPES).
   * @returns A SQL fragment safe to embed in the SELECT list.
   */
  private metricExpression(metric: DashboardMetric, dbValue: string) {
    if (metric === 'count') {
      // COUNT ignores the NULL rows produced by the LEFT JOIN, so empty buckets yield 0.
      return Prisma.sql`COUNT(l.id) FILTER (WHERE l."type_generate" = ${dbValue})`;
    }

    const column =
      metric === 'image' ? Prisma.sql`l.used_image` : Prisma.sql`l.used_credit`;

    return Prisma.sql`COALESCE(SUM(CASE WHEN l."type_generate" = ${dbValue} THEN ${column} ELSE 0 END), 0)`;
  }

  /**
   * The most recent completed generations, for the Overview "Recent Generations" panel.
   *
   * Shares {@link buildLogWhere} with the stat cards and the trend series, so a generation
   * listed here is guaranteed to be counted in both of those.
   *
   * @param organizationId Organization UUID.
   * @param filter Range, project scope and row limit.
   * @returns Newest-first generations with canonical type keys.
   */
  async findRecentGenerations(
    organizationId: string,
    filter: DashboardFilterDto = {},
  ) {
    const parsedLimit = Number(filter.limit);
    const take =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(Math.trunc(parsedLimit), 50)
        : 10;

    // Cast justified: LogRepository.findMany is not generic over its args, so TypeScript
    // cannot see the `select`ed relations. RecentGenerationRow describes the real payload.
    const logs = (await this.logRepo.findMany({
      where: this.buildLogWhere(organizationId, filter),
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        taskId: true,
        typeGenerate: true,
        prompt: true,
        usedCredit: true,
        usedImage: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
        users: { select: { userId: true, fullname: true, username: true } },
      },
    })) as unknown as RecentGenerationRow[];

    return logs.map((log) => ({
      id: log.id,
      taskId: log.taskId,
      // Normalise the stored literal (e.g. 'omnihumen') to the canonical API key.
      type: toGenerationTypeKey(log.typeGenerate),
      prompt: log.prompt,
      usedCredit: log.usedCredit ?? 0,
      usedImage: log.usedImage ?? 0,
      createdAt: log.createdAt,
      projectId: log.project?.id ?? null,
      projectName: log.project?.name ?? null,
      userId: log.users?.userId ?? null,
      userFullname: log.users?.fullname ?? log.users?.username ?? null,
    }));
  }

  /**
   * Credit spent per month and type.
   *
   * @deprecated Kept for existing callers; prefer {@link findGenerationSeries}. Emits the
   *   legacy `month` key rather than `bucket` so the response shape is unchanged.
   */
  async countCreditPerMonthAndType(
    organizationId: string,
    filter: DashboardFilterDto = {},
  ) {
    return this.toLegacyMonthlyShape(
      await this.findGenerationSeries(organizationId, {
        ...filter,
        metric: 'credit',
        granularity: 'month',
      }),
    );
  }

  /**
   * Images generated per month and type.
   *
   * @deprecated Kept for existing callers; prefer {@link findGenerationSeries}. Emits the
   *   legacy `month` key rather than `bucket` so the response shape is unchanged.
   */
  async countGeneratedPerMonthAndType(
    organizationId: string,
    filter: DashboardFilterDto = {},
  ) {
    return this.toLegacyMonthlyShape(
      await this.findGenerationSeries(organizationId, {
        ...filter,
        metric: 'image',
        granularity: 'month',
      }),
    );
  }

  /**
   * Renames `bucket` back to `month` for the two deprecated endpoints.
   *
   * @param rows Series rows from {@link findGenerationSeries}.
   * @returns The same rows keyed by `month`.
   */
  private toLegacyMonthlyShape(rows: Record<string, string | number>[]) {
    return rows.map(({ bucket, ...rest }) => ({ month: bucket, ...rest }));
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
