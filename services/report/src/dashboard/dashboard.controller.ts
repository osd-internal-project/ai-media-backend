import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';

import { DashboardService } from './dashboard.service';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import * as dayjs from 'dayjs';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview-summary/:organizationId')
  findOverviewSummary(
    @Param('organizationId') organizationId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.dashboardService.findOverviewSummary(organizationId, filter);
  }

  @Get('generation-series/:organizationId')
  findGenerationSeries(
    @Param('organizationId') organizationId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.dashboardService.findGenerationSeries(organizationId, filter);
  }

  @Get('recent-generations/:organizationId')
  findRecentGenerations(
    @Param('organizationId') organizationId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.dashboardService.findRecentGenerations(organizationId, filter);
  }

  @Get('credit-per-month-and-type/:organizationId')
  countCreditPerMonthAndType(
    @Param('organizationId') organizationId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.dashboardService.countCreditPerMonthAndType(
      organizationId,
      filter,
    );
  }

  @Get('generated-per-month-and-type/:organizationId')
  countGeneratedPerMonthAndType(
    @Param('organizationId') organizationId: string,
    @Query() filter: DashboardFilterDto,
  ) {
    return this.dashboardService.countGeneratedPerMonthAndType(
      organizationId,
      filter,
    );
  }
  @Post()
  create(@Body() createDashboardDto: CreateDashboardDto) {
    return this.dashboardService.create(createDashboardDto);
  }
  @Post('download')
  async downloadExcel(@Body() query: any, @Res() res: Response): Promise<void> {
    const subject = 'test';
    const excel = await this.dashboardService.testExport(query, subject);
    const date = dayjs().toISOString();
    const fileName = `report_${subject}_${date}.xlsx`;
    const encoded = encodeURIComponent(fileName);
    res
      .setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      )
      .setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encoded}`,
      )
      .send(excel);
  }
  @Get()
  findAll() {
    return this.dashboardService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dashboardService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDashboardDto: UpdateDashboardDto,
  ) {
    return this.dashboardService.update(+id, updateDashboardDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.dashboardService.remove(+id);
  }
}
