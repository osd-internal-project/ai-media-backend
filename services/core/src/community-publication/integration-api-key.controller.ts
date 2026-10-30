import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  AuthUser,
  CurrentUser,
  IntegrationApiKeyRepository,
  generateApiKey,
} from '@ai-media/share';
import { CreateIntegrationApiKeyDto } from './dto/community-publication.dto';

const PUBLIC_FIELDS = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  createdByUserId: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

const superAdminOrFail = (user: AuthUser | undefined): AuthUser => {
  if (user?.role !== 'SUPER_ADMIN') throw new ForbiddenException('SUPER_ADMIN only');
  return user;
};

@Injectable()
export class IntegrationApiKeyService {
  constructor(private readonly repo: IntegrationApiKeyRepository) {}

  findAll() {
    return this.repo.findMany({ select: PUBLIC_FIELDS, orderBy: { createdAt: 'desc' } });
  }

  /** @returns แถวใหม่ + `key` ตัวจริง — ครั้งเดียว ไม่มีทางดูซ้ำ */
  async create(userId: string, dto: CreateIntegrationApiKeyDto) {
    const { key, prefix, keyHash } = generateApiKey();
    const row = await this.repo.create({
      data: { name: dto.name, scopes: [...new Set(dto.scopes)], prefix, keyHash, createdByUserId: userId },
      select: PUBLIC_FIELDS,
    });
    return { ...row, key };
  }

  async revoke(id: string) {
    const row = await this.repo.findOne({ where: { id }, select: PUBLIC_FIELDS });
    if (!row) throw new NotFoundException('API key not found');
    if (row.revokedAt) return row;
    return this.repo.update({ where: { id }, data: { revokedAt: new Date() }, select: PUBLIC_FIELDS });
  }
}

/** key ที่ระบบภายนอกใช้เรียก AI Cave — SUPER_ADMIN เท่านั้น */
@Controller('integration-api-keys')
export class IntegrationApiKeyController {
  constructor(private readonly service: IntegrationApiKeyService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser | undefined) {
    superAdminOrFail(user);
    return this.service.findAll();
  }

  @Post()
  create(@CurrentUser() user: AuthUser | undefined, @Body() dto: CreateIntegrationApiKeyDto) {
    return this.service.create(superAdminOrFail(user).userId, dto);
  }

  @Delete(':id')
  revoke(@CurrentUser() user: AuthUser | undefined, @Param('id', ParseUUIDPipe) id: string) {
    superAdminOrFail(user);
    return this.service.revoke(id);
  }
}
