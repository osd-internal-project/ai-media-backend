import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Res,
} from '@nestjs/common';
import { Response } from 'express';

import { DashboardService } from './dashboard.service';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';
import * as dayjs from 'dayjs';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview-summary/:organizationId')
  findOverviewSummary(@Param('organizationId') organizationId: string) {
    return this.dashboardService.findOverviewSummary(organizationId);
  }

  @Get('credit-per-month-and-type/:organizationId')
  findCreditPerMonthAndType(@Param('organizationId') organizationId: string) {
    return this.dashboardService.findCreditPerMonthAndType(organizationId);
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
