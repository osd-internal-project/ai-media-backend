import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

/** Which quantity the generation series and summary should report. */
export type DashboardMetric = 'count' | 'credit' | 'image';

/** Bucket width for the generation series. */
export type DashboardGranularity = 'day' | 'month';

/**
 * Query filter shared by every dashboard read endpoint.
 *
 * The global ValidationPipe (services/report/src/main.ts) runs without `transform`, so every
 * field stays a raw string here and is parsed in DashboardService.
 */
export class DashboardFilterDto {
  /** Inclusive start of the range, ISO 8601. Omit for "all time". */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Inclusive end of the range, ISO 8601. Omit for "up to now". */
  @IsOptional()
  @IsISO8601()
  to?: string;

  /** Scope every figure to a single project. */
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(['count', 'credit', 'image'])
  metric?: DashboardMetric;

  @IsOptional()
  @IsIn(['day', 'month'])
  granularity?: DashboardGranularity;

  /** Row cap for the recent-generations list. */
  @IsOptional()
  @IsString()
  limit?: string;
}

/** Status values the generation-logs endpoint accepts; `all` disables the status filter. */
export type GenerationLogStatus = 'success' | 'pending' | 'failed' | 'all';

/** Query filter for the paginated generation-logs endpoint. */
export class GenerationLogFilterDto extends DashboardFilterDto {
  @IsOptional()
  @IsString()
  userId?: string;

  /** Canonical generation type key, or `other` for NULL / unrecognised types. */
  @IsOptional()
  @IsString()
  type?: string;

  /** Defaults to `success` so totals match the Overview stat cards. */
  @IsOptional()
  @IsIn(['success', 'pending', 'failed', 'all'])
  status?: GenerationLogStatus;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
