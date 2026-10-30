import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, randomBytes } from 'crypto';
import { Request } from 'express';
import { IntegrationApiKeyRepository } from '../repositories/integrationApiKey.repository';

export const API_KEY_HEADER = 'x-api-key';
export const API_KEY_SCOPES = 'auth:apiKeyScopes';
export const INTEGRATION_API_KEY_SCOPES = ['webhook', 'original'] as const;
export type IntegrationApiKeyScope = (typeof INTEGRATION_API_KEY_SCOPES)[number];

/** scope ที่ key ต้องมีครบจึงเรียก route นี้ได้ — ใช้คู่กับ `@Public()` + `@UseGuards(ApiKeyGuard)` */
export const ApiKeyScopes = (...scopes: IntegrationApiKeyScope[]) =>
  SetMetadata(API_KEY_SCOPES, scopes);

export const hashApiKey = (key: string) =>
  createHash('sha256').update(key).digest('hex');

/** key ใหม่ + ค่าที่เก็บลง DB — ตัว key จริงคืนให้ผู้สร้างครั้งเดียว */
export function generateApiKey() {
  const key = `aick_${randomBytes(24).toString('base64url')}`;
  return { key, prefix: key.slice(0, 12), keyHash: hashApiKey(key) };
}

export type ApiKeyRequest = Request & { apiKeyId?: string };

/**
 * ตรวจ header `x-api-key` กับ key ที่ยังไม่ถูกเพิกถอน
 * ค้นด้วย sha256 ของ key จึงไม่ต้องเทียบ string แบบ timing-safe
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyRepo: IntegrationApiKeyRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const raw = request.headers[API_KEY_HEADER];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key) throw new UnauthorizedException('missing x-api-key');

    const row = await this.apiKeyRepo.findOne({
      where: { keyHash: hashApiKey(key), revokedAt: null },
    });
    if (!row) throw new UnauthorizedException('invalid api key');

    const required =
      this.reflector.getAllAndOverride<IntegrationApiKeyScope[]>(API_KEY_SCOPES, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const missing = required.filter((scope) => !row.scopes.includes(scope));
    if (missing.length > 0) {
      throw new ForbiddenException(`api key lacks scope: ${missing.join(', ')}`);
    }

    await this.apiKeyRepo.update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    });
    request.apiKeyId = row.id;
    return true;
  }
}
