import { Injectable, Logger } from '@nestjs/common';
import { SocialAccountRepository } from '../repositories';
import { decryptSecret, encryptSecret } from '../utils/crypto.util';
import { SocialPlatform } from './social.constants';
import { PublisherAccount } from './social.types';

/** เผื่อเวลาไว้ก่อน token หมดอายุจริง — กันกรณี job ค้างคิวนานแล้วค่อยรัน */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

interface RefreshedToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
}

/**
 * จุดเดียวที่แปลง SocialAccount ใน DB เป็น token ที่ใช้ยิง API ได้จริง
 *
 * รับผิดชอบ: ถอดรหัส token, ต่ออายุถ้าใกล้หมด, เขียน token ใหม่กลับ DB,
 * และ mark บัญชีเป็น EXPIRED เมื่อต่ออายุไม่ได้
 *
 * อยู่ใน libs/share เพราะทั้ง users service (ตอนถอดบัญชี) และ worker-service
 * (ตอนโพสต์) ต้องใช้ — ไม่อยากมี logic ต่ออายุสองที่
 */
@Injectable()
export class SocialTokenService {
  private readonly logger = new Logger(SocialTokenService.name);

  constructor(private readonly socialAccountRepo: SocialAccountRepository) {}

  /**
   * คืน token ที่พร้อมใช้งานของบัญชี — ต่ออายุให้อัตโนมัติถ้าจำเป็น
   *
   * @param accountId id ของ social_account
   * @returns ข้อมูลบัญชีพร้อม access token ที่ถอดรหัสและยังไม่หมดอายุ
   * @throws Error เมื่อไม่พบบัญชี บัญชีถูกถอด หรือต่ออายุไม่สำเร็จ
   */
  async resolveAccount(accountId: string): Promise<PublisherAccount> {
    const account = await this.socialAccountRepo.findUnique({
      where: { id: accountId },
    });
    if (!account) {
      throw new Error(`Social account ${accountId} not found`);
    }
    if (account.status === 'REVOKED') {
      throw new Error(
        `Social account "${account.displayName}" was disconnected — reconnect it to publish`,
      );
    }

    const platform = account.platform as SocialPlatform;
    let accessToken = decryptSecret(account.accessToken);

    if (this.isExpiring(account.tokenExpiresAt)) {
      accessToken = await this.refreshAndPersist(
        account.id,
        platform,
        account.refreshToken,
      );
    }

    return {
      id: account.id,
      platform,
      externalId: account.externalId,
      displayName: account.displayName,
      accessToken,
    };
  }

  /**
   * เช็คว่า token หมดอายุแล้วหรือใกล้หมด
   *
   * @param expiresAt เวลาหมดอายุ (null = ไม่หมดอายุ เช่น Facebook Page token)
   * @returns true เมื่อต้องต่ออายุ
   */
  private isExpiring(expiresAt: Date | null): boolean {
    if (!expiresAt) return false;
    return expiresAt.getTime() - EXPIRY_SKEW_MS <= Date.now();
  }

  /**
   * ต่ออายุ token แล้วเขียนกลับ DB
   *
   * ถ้าล้มเหลวจะ mark บัญชีเป็น EXPIRED เพื่อให้ UI ขึ้นปุ่ม "เชื่อมบัญชีใหม่"
   * แทนที่จะปล่อยให้ทุกโพสต์พังเงียบ ๆ
   *
   * @param accountId id ของบัญชี
   * @param platform platform ของบัญชี
   * @param encryptedRefreshToken refresh token ที่ยังเข้ารหัสอยู่
   * @returns access token ใหม่
   * @throws Error เมื่อไม่มี refresh token หรือ provider ปฏิเสธ
   */
  private async refreshAndPersist(
    accountId: string,
    platform: SocialPlatform,
    encryptedRefreshToken: string | null,
  ): Promise<string> {
    try {
      if (!encryptedRefreshToken) {
        throw new Error('no refresh token stored');
      }
      const refreshed = await this.callRefresh(
        platform,
        decryptSecret(encryptedRefreshToken),
      );

      await this.socialAccountRepo.update({
        where: { id: accountId },
        data: {
          accessToken: encryptSecret(refreshed.accessToken),
          ...(refreshed.refreshToken && {
            refreshToken: encryptSecret(refreshed.refreshToken),
          }),
          tokenExpiresAt: refreshed.expiresAt,
          status: 'ACTIVE',
        },
      });
      return refreshed.accessToken;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `refresh failed for social account ${accountId} (${platform}): ${reason}`,
      );
      await this.socialAccountRepo.update({
        where: { id: accountId },
        data: { status: 'EXPIRED' },
      });
      throw new Error(
        `Token for this ${platform} account expired and could not be refreshed — reconnect the account`,
      );
    }
  }

  /**
   * เรียก refresh endpoint ของ provider
   *
   * อ่าน credential จาก process.env ตรง ๆ (แบบเดียวกับ TosService) เพราะ service นี้
   * ถูกใช้จากหลาย NestJS app ที่มี ConfigModule คนละชุด
   *
   * @param platform platform ของบัญชี
   * @param refreshToken refresh token ที่ถอดรหัสแล้ว
   * @returns token ชุดใหม่
   * @throws Error เมื่อ provider ไม่รองรับการ refresh หรือปฏิเสธคำขอ
   */
  private async callRefresh(
    platform: SocialPlatform,
    refreshToken: string,
  ): Promise<RefreshedToken> {
    switch (platform) {
      case 'TIKTOK':
        return this.refreshTikTok(refreshToken);
      case 'YOUTUBE':
        return this.refreshGoogle(refreshToken);
      case 'FACEBOOK':
      case 'INSTAGRAM':
        // Page token ที่ derive จาก long-lived user token ไม่หมดอายุ
        // ถ้ามาถึงตรงนี้แปลว่าผู้ใช้เพิกถอนสิทธิ์แล้วจริง ๆ
        throw new Error('Meta tokens cannot be refreshed programmatically');
      default:
        throw new Error(`Unsupported platform "${platform}"`);
    }
  }

  /**
   * ต่ออายุ token ของ TikTok
   *
   * @param refreshToken refresh token ที่ถอดรหัสแล้ว
   * @returns token ชุดใหม่
   */
  private async refreshTikTok(refreshToken: string): Promise<RefreshedToken> {
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
    const data = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error_description?: string;
      error?: string;
    };
    // TikTok ตอบ 200 พร้อม field error เวลาผิดพลาด จึงเช็ค body ไม่ใช่แค่ status
    if (!data?.access_token) {
      throw new Error(
        data?.error_description ?? data?.error ?? 'TikTok refresh failed',
      );
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    };
  }

  /**
   * ต่ออายุ token ของ Google/YouTube
   *
   * @param refreshToken refresh token ที่ถอดรหัสแล้ว
   * @returns token ชุดใหม่ (Google ไม่ส่ง refresh token กลับ จึงคืน null ให้เก็บตัวเดิม)
   */
  private async refreshGoogle(refreshToken: string): Promise<RefreshedToken> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!response.ok || !data?.access_token) {
      throw new Error(data?.error_description ?? 'Google refresh failed');
    }
    return {
      accessToken: data.access_token,
      refreshToken: null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    };
  }
}
