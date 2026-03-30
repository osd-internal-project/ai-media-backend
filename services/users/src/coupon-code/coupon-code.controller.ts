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
import { CouponCodeService } from './coupon-code.service';
import { CouponCodeUsageService } from './coupon-code-usage.service';
import { Prisma } from '@prisma/client';
import { UseCouponCodeDto } from './dto/use-coupon.dto';

@Controller('coupon-code')
export class CouponCodeController {
  constructor(
    private readonly couponCodeService: CouponCodeService,
    private readonly couponCodeUsageService: CouponCodeUsageService,
  ) {}

  @Post()
  create(@Body() createCouponCodeDto: Prisma.CouponCodeCreateInput) {
    return this.couponCodeService.create(createCouponCodeDto);
  }

  @Post('use')
  useCoupon(@Body() useCouponCodeDto: UseCouponCodeDto) {
    return this.couponCodeService.useCoupon(useCouponCodeDto);
  }

  @Get()
  findMany(@Query() condition?: { skip?: string; take?: string; status?: string }) {
    return this.couponCodeService.findMany(condition || {});
  }

  @Get('usage')
  findAllUsage(@Query() condition?: Prisma.CouponCodeUsageFindManyArgs) {
    return this.couponCodeUsageService.findAll(condition || {});
  }

  @Get('usage/coupon-code/:couponCodeId')
  findUsageByCouponCodeId(@Param('couponCodeId') couponCodeId: string) {
    return this.couponCodeUsageService.findUsageByCouponCodeId(couponCodeId);
  }


  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.couponCodeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string, 
    @Body() updateCouponCodeDto: Prisma.CouponCodeUpdateInput,
  ) {
    return this.couponCodeService.update(id, updateCouponCodeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.couponCodeService.remove(id);
  }

  @Get('usage/:id')
  findUsageById(@Param('id') id: string) {
    return this.couponCodeUsageService.findOne(id);
  }
}
