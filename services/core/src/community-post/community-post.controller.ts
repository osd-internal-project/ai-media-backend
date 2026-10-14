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
import { CommunityPostService } from './community-post.service';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import {
  ActorDto,
  ListCommunityPostDto,
  ReviewCommunityPostDto,
  ScheduleCommunityPostDto,
  UnpublishCommunityPostDto,
  UpdateCommunityPostDto,
} from './dto/update-community-post.dto';

/**
 * ฝั่ง studio ของฟีเจอร์ Communication — ต้องเป็นสมาชิก org เท่านั้น
 *
 * ตัวตนส่งมาเป็น userId/organizationId ตรง ๆ ตาม convention เดิมของโปรเจกต์
 * (ยังไม่มี guard กลางในระบบ) และถูกตรวจสิทธิ์ซ้ำใน service ทุกคำสั่ง
 * ส่วนที่ผู้เยี่ยมชมทั่วไปเข้าถึงได้อยู่ที่ PublicCommunityController แยกไฟล์กัน
 */
@Controller('community-post')
export class CommunityPostController {
  constructor(private readonly communityPostService: CommunityPostService) {}

  @Post()
  create(@Body() dto: CreateCommunityPostDto) {
    return this.communityPostService.create(dto);
  }

  @Get()
  findMany(@Query() query: ListCommunityPostDto) {
    return this.communityPostService.findMany(query);
  }

  @Get('pending-count')
  countPendingApproval(@Query('organizationId') organizationId: string) {
    return this.communityPostService.countPendingApproval(organizationId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.communityPostService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommunityPostDto,
  ) {
    return this.communityPostService.update(id, dto);
  }

  @Patch(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCommunityPostDto,
  ) {
    return this.communityPostService.approve(id, dto);
  }

  @Patch(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCommunityPostDto,
  ) {
    return this.communityPostService.reject(id, dto);
  }

  @Post(':id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActorDto) {
    return this.communityPostService.publish(id, dto.userId);
  }

  @Post(':id/schedule')
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleCommunityPostDto,
  ) {
    return this.communityPostService.schedule(id, dto);
  }

  @Post(':id/unschedule')
  unschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActorDto) {
    return this.communityPostService.unschedule(id, dto.userId);
  }

  @Post(':id/unpublish')
  unpublish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnpublishCommunityPostDto,
  ) {
    return this.communityPostService.unpublish(id, dto);
  }

  @Post(':id/republish')
  republish(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActorDto) {
    return this.communityPostService.republish(id, dto.userId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('userId') userId: string,
  ) {
    return this.communityPostService.remove(id, userId);
  }
}
