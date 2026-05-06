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
  @Post('group')
  createGroup(
    @Body()
    createCouponCodeDto: Prisma.CouponCodeCreateInput & { amount: number },
  ) {
    return this.couponCodeService.createGroup(createCouponCodeDto);
  }

  @Post('use')
  useCoupon(@Body() useCouponCodeDto: UseCouponCodeDto) {
    return this.couponCodeService.useCoupon(useCouponCodeDto);
  }

  @Get('export')
  async export(@Res() res: Response, @Query() condition?: any) {
    const csv = await this.couponCodeService.exportCsv(condition || {});
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('coupons.csv');
    return res.send(csv);
  }

  @Get()
  findMany(@Query() condition?: any) {
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

  @Get('usage/organization/:organizationcode')
  findUsageManyByOrganization(
    @Param('organizationcode') organizationcode: string,
    @Query() condition?: any,
  ) {
    return this.couponCodeService.findUsageManyByOrganization(
      organizationcode,
      condition || {},
    );
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
