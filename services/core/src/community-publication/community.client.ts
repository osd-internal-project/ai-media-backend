import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { CommunityVisibility } from '@prisma/client';
import { communityConfigs } from '../configs';

export interface CommunityItemMedia {
  type: string;
  url: string;
  thumbnailUrl: string | null;
}

/** body ของ PUT /items/{aicavePublicationId} — ดู docs/community-api-contract.md */
export interface CommunityItemPayload {
  aicavePublicationId: string;
  creator: { keycloakSub: string; fullname: string };
  organizationId: string;
  visibility: CommunityVisibility;
  type: string | null;
  modelName: string | null;
  prompt: string | null;
  media: CommunityItemMedia[];
  createdAt: string;
}

const TIMEOUT_MS = 15_000;

/** ขาออกไป Community (Foundise) — PUT ซ้ำด้วย id เดิมต้องได้ผลเหมือนเดิม */
@Injectable()
export class CommunityClient {
  constructor(
    @Inject(communityConfigs.KEY)
    private readonly config: ConfigType<typeof communityConfigs>,
  ) {}

  /** @returns id ของ item ฝั่ง Community ถ้าตอบมา */
  async upsertItem(payload: CommunityItemPayload): Promise<string | null> {
    const { data } = await this.http().put<{ id?: unknown }>(
      `/items/${encodeURIComponent(payload.aicavePublicationId)}`,
      payload,
    );
    return typeof data?.id === 'string' ? data.id : null;
  }

  async deleteItem(aicavePublicationId: string): Promise<void> {
    await this.http().delete(`/items/${encodeURIComponent(aicavePublicationId)}`, {
      // ลบซ้ำหรือไม่มีอยู่แล้วถือว่าสำเร็จ
      validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
    });
  }

  private http(): AxiosInstance {
    const baseURL = this.config.foundiseApiBaseUrl.trim();
    if (!baseURL) throw new Error('COMMUNITY_API_BASE_URL is not set');
    return axios.create({
      baseURL: baseURL.replace(/\/+$/, ''),
      timeout: TIMEOUT_MS,
      headers: { 'x-api-key': this.config.foundiseApiKey },
    });
  }
}
