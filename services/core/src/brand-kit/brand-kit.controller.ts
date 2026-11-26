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
import { BrandKitService } from './brand-kit.service';
import { BrandKitPromptService } from './brand-kit-prompt.service';
import { CreateBrandKitDto, UpdateBrandKitDto } from './dto/brand-kit.dto';

@Controller('brand-kit')
export class BrandKitController {
  constructor(
    private readonly brandKitService: BrandKitService,
    private readonly brandKitPromptService: BrandKitPromptService,
  ) {}

  @Post()
  create(@Body() data: CreateBrandKitDto, @CurrentUser() authUser?: AuthUser) {
    return this.brandKitService.create(authUser, data);
  }
  @Post('set-default/:id')
  setDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitService.setDefault(authUser, id);
  }
  @Get()
  findAll(@CurrentUser() authUser?: AuthUser) {
    return this.brandKitService.findAll(authUser);
  }

  @Get('organization/:organizationId/default')
  findDefaultByOrganization(
    @Param('organizationId') organizationId: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitService.findDefaultByOrganization(
      authUser,
      organizationId,
    );
  }
  @Get('organization/:organizationId')
  findByOrganization(
    @Param('organizationId') organizationId: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitService.findByOrganization(authUser, organizationId);
  }
  @Get(':id/prompt-preview')
  promptPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitPromptService.preview(authUser, id);
  }
  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitService.findOne(authUser, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateBrandKitDto,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitService.update(authUser, id, data);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() authUser?: AuthUser,
  ) {
    return this.brandKitService.remove(authUser, id);
  }
}
