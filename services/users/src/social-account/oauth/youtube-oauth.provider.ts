import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { SocialPlatform } from '@ai-media/share';
import configs from '../../configs';
import { DiscoveredAccount, OAuthProvider } from './oauth-provider.interface';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

interface YouTubeChannelListResponse {
  items?: {
    id: string;
    snippet?: {
      title?: string;
      thumbnails?: { default?: { url?: string } };
    };
  }[];
}

/**
 * OAuth ของ Google สำหรับอัปโหลดวิดีโอขึ้น YouTube
 *
 * หมายเหตุ quota: videos.insert กิน 1600 units ต่อครั้ง ส่วน default quota คือ
 * 10,000 units/วัน = อัปได้ราว 6 คลิป/วัน ถ้าจะใช้จริงต้องยื่นขอเพิ่ม quota
 */
@Injectable()
export class YouTubeOAuthProvider implements OAuthProvider {
  readonly platform: SocialPlatform = 'YOUTUBE';

  constructor(private readonly http: HttpService) {}

  private get cfg() {
    return configs().social.google;
  }

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.cfg.clientId ?? '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: YOUTUBE_SCOPES.join(' '),
      // ต้องมีทั้งคู่เพื่อให้ได้ refresh token กลับมาแน่นอน — Google จะส่ง refresh token
      // เฉพาะรอบแรกที่ผู้ใช้ยินยอม ถ้าไม่บังคับ consent จะไม่ได้ตอนเชื่อมซ้ำ
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
  ): Promise<DiscoveredAccount[]> {
    const token = await this.postToken({
      client_id: this.cfg.clientId ?? '',
      client_secret: this.cfg.clientSecret ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    if (!token.refresh_token) {
      throw new Error(
        'Google did not return a refresh token — revoke the app in the Google account and reconnect',
      );
    }

    const channels = await this.fetchChannels(token.access_token);
    if (channels.length === 0) {
      throw new Error('This Google account has no YouTube channel');
    }

    return channels.map((channel) => ({
      platform: 'YOUTUBE' as const,
      externalId: channel.id,
      displayName: channel.snippet?.title ?? 'YouTube channel',
      avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
      scopes: token.scope ? token.scope.split(' ') : YOUTUBE_SCOPES,
    }));
  }

  async verifyToken(
    _platform: SocialPlatform,
    externalId: string,
    accessToken: string,
  ): Promise<{ displayName: string; avatarUrl: string | null }> {
    let channels: YouTubeChannelListResponse['items'];
    try {
      channels = await this.fetchChannels(accessToken);
    } catch (error) {
      const message = (
        error as { response?: { data?: { error?: { message?: string } } } }
      )?.response?.data?.error?.message;
      throw new Error(
        `Google rejected the token: ${
          message ?? (error instanceof Error ? error.message : 'unknown error')
        }`,
      );
    }

    if (!channels || channels.length === 0) {
      throw new Error('This token has no YouTube channel attached');
    }
    // token อาจเข้าถึงได้หลาย channel — ต้องเป็นตัวที่แอดมินกรอกมาจริง ๆ
    const channel = channels.find((item) => item.id === externalId);
    if (!channel) {
      throw new Error(
        `This token does not grant access to channel ${externalId} (it can reach: ${channels
          .map((item) => item.id)
          .join(', ')})`,
      );
    }
    return {
      displayName: channel.snippet?.title ?? 'YouTube channel',
      avatarUrl: channel.snippet?.thumbnails?.default?.url ?? null,
    };
  }

  async revoke(account: { accessToken: string }): Promise<void> {
    await firstValueFrom(
      this.http.post(
        'https://oauth2.googleapis.com/revoke',
        new URLSearchParams({ token: account.accessToken }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );
  }

  /**
   * เรียก token endpoint ของ Google
   *
   * @param body พารามิเตอร์แบบ x-www-form-urlencoded
   * @returns token response
   * @throws Error เมื่อไม่ได้ access token
   */
  private async postToken(
    body: Record<string, string>,
  ): Promise<GoogleTokenResponse> {
    const { data } = await firstValueFrom(
      this.http.post<GoogleTokenResponse>(
        'https://oauth2.googleapis.com/token',
        new URLSearchParams(body).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );
    if (!data?.access_token) {
      throw new Error('Google did not return an access token');
    }
    return data;
  }

  /**
   * ดึง channel ที่บัญชี Google นี้เป็นเจ้าของ
   *
   * @param accessToken access token ที่เพิ่งได้มา
   * @returns รายการ channel (ว่างได้ถ้าบัญชียังไม่เคยสร้าง channel)
   */
  private async fetchChannels(accessToken: string) {
    const { data } = await firstValueFrom(
      this.http.get<YouTubeChannelListResponse>(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    );
    return data?.items ?? [];
  }
}
