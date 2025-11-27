import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}
  @Get('find-owner/:token')
  findOwnerTableDashboard(@Param('token') token: string) {
    return this.dashboardService.findOwnerTableDashboard(token);
  }
  @Get('find-product/:token')
  findProductTableDashboard(@Param('token') token: string) {
    return this.dashboardService.findProductTableDashboard(token);
  }
  @Get(':token')
  findSummaryDashboard(@Param('token') token: string) {
    return this.dashboardService.findSummaryDashboard(token);
  }
}
