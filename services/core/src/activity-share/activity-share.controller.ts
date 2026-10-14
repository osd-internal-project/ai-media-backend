import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ActivityShareService } from './activity-share.service';
import { CreateActivityShareDto } from './dto/create-activity-share.dto';
import {
  ActorDto,
  ListActivityShareDto,
  ReviewActivityShareDto,
  UpdateActivityShareDto,
} from './dto/update-activity-share.dto';

@Controller('activity-share')
export class ActivityShareController {
  constructor(private readonly activityShareService: ActivityShareService) {}

  @Post()
  create(@Body() dto: CreateActivityShareDto) {
    return this.activityShareService.create(dto);
  }

  @Get()
  findMany(@Query() query: ListActivityShareDto) {
    return this.activityShareService.findMany(query);
  }

  @Get('pending-count')
  countPendingApproval(@Query('organizationId') organizationId: string) {
    return this.activityShareService.countPendingApproval(organizationId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.activityShareService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActivityShareDto,
  ) {
    return this.activityShareService.update(id, dto);
  }

  @Patch(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewActivityShareDto,
  ) {
    return this.activityShareService.approve(id, dto);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewActivityShareDto,
  ) {
    return this.activityShareService.reject(id, dto);
  }

  @Post(':id/send')
  send(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActorDto) {
    return this.activityShareService.send(id, dto.userId);
  }

  @Post(':id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActorDto) {
    return this.activityShareService.retry(id, dto.userId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('userId') userId: string,
  ) {
    return this.activityShareService.remove(id, userId);
  }
}
