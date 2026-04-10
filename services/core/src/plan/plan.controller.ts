import { Controller, Get, Param, Post, Body, Patch, Delete } from '@nestjs/common';
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planService.findById(id);
  }

  @Post()
  create(@Body() data: any) {
    return this.planService.create(data);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() data: any) {
    return this.planService.update(id, data);
  }

  @Delete(':id')
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
