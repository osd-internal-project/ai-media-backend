import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SocialPlatform } from '@ai-media/share';
import configs from '../../configs';
import { DiscoveredAccount, OAuthProvider } from './oauth-provider.interface';

const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];
const TIKTOK_API = 'https://open.tiktokapis.com/v2';

interface TikTokTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface TikTokUserInfoResponse {
  data?: {
    user?: { open_id: string; display_name?: string; avatar_url?: string };
  };
  error?: { code: string; message: string };
}

/**
 * OAuth v2 ของ TikTok
 *
 * หมายเหตุสำคัญ: แอปที่ยังไม่ผ่าน content-posting audit จะโพสต์ได้เฉพาะแบบ
 * SELF_ONLY (เห็นคนเดียว) เท่านั้น — ตัว OAuth ทำงานได้ปกติ แต่การเผยแพร่สู่สาธารณะ
 * จะถูก TikTok บล็อกจนกว่าจะผ่าน audit
 */
@Injectable()
export class TikTokOAuthProvider implements OAuthProvider {
  readonly platform: SocialPlatform = 'TIKTOK';

  constructor(private readonly http: HttpService) {}

  private get cfg() {
    return configs().social.tiktok;
  }

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_key: this.cfg.clientKey ?? '',
      response_type: 'code',
      scope: TIKTOK_SCOPES.join(','),
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<DiscoveredAccount[]> {
    const token = await this.postToken({
      client_key: this.cfg.clientKey ?? '',
      client_secret: this.cfg.clientSecret ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const profile = await this.fetchUserInfo(token.access_token);

    return [
      {
        platform: 'TIKTOK',
        externalId: token.open_id,
        displayName: profile.displayName ?? 'TikTok account',
        avatarUrl: profile.avatarUrl,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        scopes: token.scope ? token.scope.split(',') : TIKTOK_SCOPES,
      },
    ];
  }

  async revoke(account: { accessToken: string }): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${TIKTOK_API}/oauth/revoke/`,
        new URLSearchParams({
          client_key: this.cfg.clientKey ?? '',
          client_secret: this.cfg.clientSecret ?? '',
          token: account.accessToken,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      ),
    );
  }

  /**
   * เรียก /oauth/token/ ของ TikTok (ใช้ทั้งตอนแลก code และตอน refresh)
   *
   * TikTok คืน HTTP 200 พร้อม field `error` เวลาผิดพลาด จึงต้องเช็ค body เอง
   *
   * @param body พารามิเตอร์แบบ x-www-form-urlencoded
   * @returns token response
   * @throws Error เมื่อ TikTok ตอบ error หรือไม่มี access_token
   */
  private async postToken(
    body: Record<string, string>,
  ): Promise<TikTokTokenResponse> {
    const { data } = await firstValueFrom(
      this.http.post<TikTokTokenResponse>(
        `${TIKTOK_API}/oauth/token/`,
        new URLSearchParams(body).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      ),
    );
    if (data?.error || !data?.access_token) {
      throw new Error(
        `TikTok token request failed: ${data?.error_description ?? data?.error ?? 'unknown error'}`,
      );
    }
    return data;
  }

  async verifyToken(
    _platform: SocialPlatform,
    externalId: string,
    accessToken: string,
  ): Promise<{ displayName: string; avatarUrl: string | null }> {
    // ตั้งใจไม่ใช้ fetchUserInfo เพราะตัวนั้นกลืน error (ถูกต้องสำหรับ flow OAuth)
    // แต่ตอนตรวจ token ที่วางมือ ต้องดังให้รู้ว่าใช้ไม่ได้
    let data: TikTokUserInfoResponse;
    try {
      const response = await firstValueFrom(
        this.http.get<TikTokUserInfoResponse>(
          `${TIKTOK_API}/user/info/?fields=open_id,display_name,avatar_url`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );
      data = response.data;
    } catch (error) {
      const message = (
        error as { response?: { data?: { error?: { message?: string } } } }
      )?.response?.data?.error?.message;
      throw new Error(
        `TikTok rejected the token: ${
          message ?? (error instanceof Error ? error.message : 'unknown error')
        }`,
      );
    }

    // TikTok ตอบ 200 พร้อม field error เวลาผิดพลาด จึงต้องเช็ค body ด้วย
    if (data?.error?.code && data.error.code !== 'ok') {
      throw new Error(`TikTok rejected the token: ${data.error.message}`);
    }
    const user = data?.data?.user;
    if (!user?.open_id) {
      throw new Error('TikTok did not return a user for this token');
    }
    if (user.open_id !== externalId) {
      throw new Error(
        `This token belongs to open_id ${user.open_id}, not ${externalId}`,
      );
    }
    return {
      displayName: user.display_name ?? 'TikTok account',
      avatarUrl: user.avatar_url ?? null,
    };
  }

  /**
   * ดึงชื่อ/รูปโปรไฟล์เพื่อแสดงในหน้า Connections
   *
   * ไม่ให้ล้มทั้ง flow ถ้าดึงไม่ได้ — บัญชียังใช้โพสต์ได้แม้ไม่มีชื่อสวย ๆ
   *
   * @param accessToken access token ที่เพิ่งได้มา
   * @returns ชื่อและ avatar (null ได้)
   */
  private async fetchUserInfo(
    accessToken: string,
  ): Promise<{ displayName: string | null; avatarUrl: string | null }> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<TikTokUserInfoResponse>(
          `${TIKTOK_API}/user/info/?fields=open_id,display_name,avatar_url`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );
      return {
        displayName: data?.data?.user?.display_name ?? null,
        avatarUrl: data?.data?.user?.avatar_url ?? null,
      };
    } catch {
      return { displayName: null, avatarUrl: null };
    }
  }
}
