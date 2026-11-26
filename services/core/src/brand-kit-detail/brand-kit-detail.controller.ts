import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '@ai-media/share';
import { BrandKitDetailService } from './brand-kit-detail.service';
import {
  CreateBrandKitDetailDto,
  UpdateBrandKitDetailDto,
} from './dto/brand-kit-detail.dto';

@Controller('brand-kit-detail')
export class BrandKitDetailController {
  constructor(private readonly brandKitDetailService: BrandKitDetailService) {}

  @Post()
  create(
    @Body() data: CreateBrandKitDetailDto,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitDetailService.create(authUser, data);
  }

  @Get()
  findAll(@CurrentUser() authUser?: AuthUser) {
    return this.brandKitDetailService.findAll(authUser);
  }

  @Get('type/:type/brand-kit/:brandKitId')
  findByBrandKitAndType(
    @Param('type') type: string,
    @Param('brandKitId', ParseUUIDPipe) brandKitId: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitDetailService.findByBrandKitAndType(
      authUser,
      type,
      brandKitId,
    );
  }

  @Get('brand-kit/:brandKitId')
  findByBrandKit(
    @Param('brandKitId', ParseUUIDPipe) brandKitId: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitDetailService.findByBrandKit(authUser, brandKitId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitDetailService.findOne(authUser, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateBrandKitDetailDto,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitDetailService.update(authUser, id, data);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitDetailService.remove(authUser, id);
  }
}
