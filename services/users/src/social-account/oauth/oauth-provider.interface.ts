import { SocialPlatform } from '@ai-media/share';

/**
 * บัญชีที่ดึงมาได้จาก provider หลังผู้ใช้กด consent
 * 1 consent flow อาจได้หลายบัญชี (เช่น Meta คืนทุก Page + IG ที่ผูกกับ Page)
 */
export interface DiscoveredAccount {
  readonly platform: SocialPlatform;
  /** id ฝั่ง provider — FB Page id / IG user id / TikTok open_id / YT channel id */
  readonly externalId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  /** token ดิบ ยังไม่เข้ารหัส — service จะเข้ารหัสก่อนเขียนลง DB */
  readonly accessToken: string;
  readonly refreshToken: string | null;
  /** null = ไม่หมดอายุ (เช่น Facebook Page token ที่ได้จาก long-lived user token) */
  readonly tokenExpiresAt: Date | null;
  readonly scopes: readonly string[];
}

/**
 * สัญญาของ OAuth 1 เจ้า
 *
 * ตั้งใจแยกจาก SocialPublisher (libs/share/src/social) เพราะคนละหน้าที่:
 * ตัวนี้ดูแล "การเชื่อมบัญชี" อยู่ใน users service, อีกตัวดูแล "การโพสต์" อยู่ใน worker
 */
export interface OAuthProvider {
  /** platform ที่ flow นี้เป็นตัวเริ่มต้นให้ (Meta ใช้ตัวเดียวได้ทั้ง FB และ IG) */
  readonly platform: SocialPlatform;

  /**
   * สร้าง URL หน้า consent ของ provider
   *
   * @param state token ที่ sign แล้ว ใช้ผูก callback กลับมาหา org/user เดิม
   * @param redirectUri ต้องตรงกับที่ลงทะเบียนไว้ใน provider console เป๊ะ ๆ
   * @returns URL ที่ให้ frontend เปิด popup
   */
  buildAuthorizeUrl(state: string, redirectUri: string): string;

  /**
   * แลก authorization code เป็น token แล้วดึงรายการบัญชีที่โพสต์ได้
   *
   * @param code authorization code จาก callback
   * @param redirectUri ต้องเป็นค่าเดียวกับตอน buildAuthorizeUrl
   * @returns บัญชีทั้งหมดที่พบ (อาจว่างถ้าผู้ใช้ไม่มี Page/channel)
   */
  exchangeCode(code: string, redirectUri: string): Promise<DiscoveredAccount[]>;

  /**
   * ตรวจว่า token ที่แอดมินวางมาใช้งานได้จริงกับบัญชีนี้ แล้วดึงชื่อ/รูปมาแสดง
   *
   * ใช้ในเส้นทาง MANUAL เท่านั้น — token ที่วางมือเป็น input เดียวที่ดูด้วยตาไม่ออกว่าถูกหรือผิด
   * (พิมพ์ผิด, ใช้ User token แทน Page token, หรือ scope ไม่ครบ ล้วนหน้าตาเหมือนกันหมด)
   * ถ้าไม่ตรวจก่อนเขียน จะไปรู้ตอนโพสต์ล้มเหลวอีกหลายวันถัดมา
   *
   * รับ platform เป็นพารามิเตอร์เพราะ Meta provider ดูแลทั้ง FACEBOOK และ INSTAGRAM
   * ซึ่งตรวจกันคนละ endpoint
   *
   * @param platform platform ของบัญชี
   * @param externalId id ฝั่ง provider ที่แอดมินกรอกมา
   * @param accessToken token ที่จะตรวจ (plaintext)
   * @returns ชื่อและรูปโปรไฟล์จาก provider เพื่อเอาไปเติมให้อัตโนมัติ
   * @throws Error พร้อมข้อความจาก provider เมื่อ token ผิด สิทธิ์ไม่พอ หรือ id ไม่ตรง
   */
  verifyToken(
    platform: SocialPlatform,
    externalId: string,
    accessToken: string,
  ): Promise<{ displayName: string; avatarUrl: string | null }>;

  /**
   * ยกเลิกสิทธิ์ฝั่ง provider
   *
   * หมายเหตุ: การ "ต่ออายุ token" ไม่ได้อยู่ใน interface นี้ เพราะ worker-service
   * ก็ต้องต่ออายุก่อนโพสต์เหมือนกัน จึงย้ายไปไว้ที่ SocialTokenService ใน libs/share
   * เพื่อให้มี implementation เดียว
   *
   * @param account บัญชีที่จะถอด (token ถอดรหัสแล้ว)
   */
  revoke(account: {
    externalId: string;
    accessToken: string;
  }): Promise<void>;
}
