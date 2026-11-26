import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Patch,
  Delete,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { AuthUser, CurrentUser, SystemAdminGuard } from '@ai-media/share';
import { PlanService } from './plan.service';

@Controller('plans')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get()
  findAll() {
    return this.planService.findAll();
  }

  @Get('popular')
  findPopular() {
    return this.planService.findPopular();
  }

  @Get('formatted')
  findAllFormatted() {
    return this.planService.findAllFormatted();
  }

  @Get(':id/organizations-impact')
  @UseGuards(SystemAdminGuard)
  organizationsImpact(@Param('id') id: string) {
    return this.planService.organizationsImpact(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planService.findById(id);
  }

  @Post()
  @UseGuards(SystemAdminGuard)
  create(@Body() data: any) {
    return this.planService.create(data);
  }

  @Patch(':id/status')
  @UseGuards(SystemAdminGuard)
  updateStatus(@Param('id') id: string, @Body('status') status: unknown) {
    if (typeof status !== 'boolean') {
      throw new BadRequestException('status must be a boolean');
    }
    return this.planService.updateStatus(id, status);
  }

  @Patch(':id')
  @UseGuards(SystemAdminGuard)
  update(
    @Param('id') id: string,
    @Body() data: any,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.planService.update(id, data, authUser);
  }

  @Delete(':id')
  @UseGuards(SystemAdminGuard)
  remove(@Param('id') id: string) {
    return this.planService.delete(id);
  }

  @Get('name/:name')
  findByName(@Param('name') name: string) {
    return this.planService.findByName(name);
  }

   @Get('price/:priceId')
  findPlanWithPrice(@Param('priceId') priceId: string) {
    return this.planService.findPlanWithPrice(priceId);
  }
}
