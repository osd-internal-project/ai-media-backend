import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SocialPlatform } from '@ai-media/share';
import configs from '../../configs';
import { DiscoveredAccount, OAuthProvider } from './oauth-provider.interface';

/** scope ที่ต้องขอเพื่อโพสต์ลง Facebook Page และ Instagram Business */
const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
];

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
}

/**
 * OAuth ของ Meta — ครอบคลุมทั้ง Facebook Page และ Instagram Business
 *
 * consent รอบเดียวได้ทั้งสอง platform: IG Business account ผูกอยู่กับ Page
 * จึงคืน DiscoveredAccount ทั้งชนิด FACEBOOK และ INSTAGRAM ออกมาพร้อมกัน
 */
@Injectable()
export class MetaOAuthProvider implements OAuthProvider {
  readonly platform: SocialPlatform = 'FACEBOOK';
  private readonly logger = new Logger(MetaOAuthProvider.name);

  constructor(private readonly http: HttpService) {}

  private get cfg() {
    return configs().social.meta;
  }

  private get graphBase(): string {
    return `https://graph.facebook.com/${this.cfg.apiVersion}`;
  }

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.cfg.appId ?? '',
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: META_SCOPES.join(','),
    });
    return `https://www.facebook.com/${this.cfg.apiVersion}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<DiscoveredAccount[]> {
    const shortLived = await this.requestToken({
      client_id: this.cfg.appId ?? '',
      client_secret: this.cfg.appSecret ?? '',
      redirect_uri: redirectUri,
      code,
    });

    // แลกเป็น long-lived user token (~60 วัน) ก่อน เพราะ Page token ที่ derive จากตัวนี้
    // จะไม่มีวันหมดอายุ ซึ่งจำเป็นสำหรับการโพสต์แบบ background
    const longLived = await this.requestToken({
      grant_type: 'fb_exchange_token',
      client_id: this.cfg.appId ?? '',
      client_secret: this.cfg.appSecret ?? '',
      fb_exchange_token: shortLived.access_token,
    });

    return this.discoverAccounts(longLived.access_token);
  }

  /**
   * เรียก /oauth/access_token
   *
   * @param params query string ตามชนิดการแลก token
   * @returns token response ของ Meta
   */
  private async requestToken(
    params: Record<string, string>,
  ): Promise<MetaTokenResponse> {
    const url = `${this.graphBase}/oauth/access_token?${new URLSearchParams(params).toString()}`;
    const { data } = await firstValueFrom(
      this.http.get<MetaTokenResponse>(url),
    );
    if (!data?.access_token) {
      throw new Error('Meta did not return an access token');
    }
    return data;
  }

  /**
   * ดึง Page ทั้งหมดที่ผู้ใช้จัดการได้ แล้วแตกเป็นบัญชี FACEBOOK + INSTAGRAM
   *
   * @param userAccessToken long-lived user token
   * @returns บัญชีที่โพสต์ได้ทั้งหมด
   */
  private async discoverAccounts(
    userAccessToken: string,
  ): Promise<DiscoveredAccount[]> {
    const fields =
      'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}';
    const url = `${this.graphBase}/me/accounts?fields=${fields}&limit=100&access_token=${userAccessToken}`;
    const { data } = await firstValueFrom(
      this.http.get<{ data: MetaPage[] }>(url),
    );

    const accounts: DiscoveredAccount[] = [];
    for (const page of data?.data ?? []) {
      accounts.push({
        platform: 'FACEBOOK',
        externalId: page.id,
        displayName: page.name,
        avatarUrl: page.picture?.data?.url ?? null,
        accessToken: page.access_token,
        refreshToken: null,
        // Page token ที่ derive จาก long-lived user token ไม่หมดอายุ
        tokenExpiresAt: null,
        scopes: META_SCOPES,
      });

      const ig = page.instagram_business_account;
      if (ig?.id) {
        accounts.push({
          platform: 'INSTAGRAM',
          externalId: ig.id,
          displayName: ig.username ? `@${ig.username}` : page.name,
          avatarUrl: ig.profile_picture_url ?? null,
          // IG Graph API ใช้ Page token ตัวเดียวกัน
          accessToken: page.access_token,
          refreshToken: null,
          tokenExpiresAt: null,
          scopes: META_SCOPES,
        });
      }
    }

    if (accounts.length === 0) {
      this.logger.warn(
        'Meta consent completed but no manageable Pages were returned',
      );
    }
    return accounts;
  }

  async verifyToken(
    platform: SocialPlatform,
    externalId: string,
    accessToken: string,
  ): Promise<{ displayName: string; avatarUrl: string | null }> {
    // FB ตรวจกับ Page, IG ตรวจกับ IG user — คนละ field set
    const fields =
      platform === 'INSTAGRAM'
        ? 'username,profile_picture_url'
        : 'name,picture{url}';
    const url = `${this.graphBase}/${externalId}?fields=${fields}&access_token=${accessToken}`;

    let data: {
      name?: string;
      username?: string;
      picture?: { data?: { url?: string } };
      profile_picture_url?: string;
    };
    try {
      const response = await firstValueFrom(this.http.get(url));
      data = response.data;
    } catch (error) {
      throw new Error(this.describeGraphError(error));
    }

    if (platform === 'INSTAGRAM') {
      if (!data?.username) {
        throw new Error(
          `This token cannot read Instagram account ${externalId} — check that it is an Instagram Business account linked to a Page`,
        );
      }
      return {
        displayName: `@${data.username}`,
        avatarUrl: data.profile_picture_url ?? null,
      };
    }

    if (!data?.name) {
      throw new Error(
        `This token cannot read Facebook Page ${externalId} — make sure it is a Page access token, not a user token`,
      );
    }
    return {
      displayName: data.name,
      avatarUrl: data.picture?.data?.url ?? null,
    };
  }

  /**
   * ดึงข้อความ error ของ Graph API ออกมาให้แอดมินอ่านรู้เรื่อง
   *
   * Meta ซ่อนสาเหตุจริงไว้ใน response body (`error.message`) ส่วน axios คืนแค่
   * "Request failed with status code 400" ซึ่งไม่ช่วยอะไรเลย
   *
   * @param error error จาก axios
   * @returns ข้อความที่อธิบายสาเหตุ
   */
  private describeGraphError(error: unknown): string {
    const graphMessage = (
      error as {
        response?: { data?: { error?: { message?: string } } };
      }
    )?.response?.data?.error?.message;
    if (graphMessage) return `Facebook rejected the token: ${graphMessage}`;
    return error instanceof Error
      ? `Could not verify the token: ${error.message}`
      : 'Could not verify the token';
  }

  async revoke(account: {
    externalId: string;
    accessToken: string;
  }): Promise<void> {
    const url = `${this.graphBase}/${account.externalId}/permissions?access_token=${account.accessToken}`;
    await firstValueFrom(this.http.delete(url));
  }
}
