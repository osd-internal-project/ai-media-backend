import { Controller, Get, Param } from '@nestjs/common';
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

  @Get(':name')
  findByName(@Param('name') name: string) {
    return this.planService.findByName(name);
  }
}
