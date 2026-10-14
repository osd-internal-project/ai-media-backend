import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OrganizationMemberRepository,
  SocialAccountRepository,
  SocialConnectionType,
  SocialPlatform,
  SocialTokenService,
  UsersRepository,
  decryptSecret,
  encryptSecret,
} from '@ai-media/share';
import configs from '../configs';
import { MetaOAuthProvider } from './oauth/meta-oauth.provider';
import { TikTokOAuthProvider } from './oauth/tiktok-oauth.provider';
import { YouTubeOAuthProvider } from './oauth/youtube-oauth.provider';
import { DiscoveredAccount, OAuthProvider } from './oauth/oauth-provider.interface';
import { SaveManualTokenDto } from './dto/save-manual-token.dto';

/** role ที่จัดการบัญชี social ของ org ได้ */
const ADMIN_ROLES = ['OWNER', 'ADMIN'];

/** role ระดับแพลตฟอร์มที่วาง token ให้ org อื่นได้ */
const SYSTEM_ADMIN_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN'];

/** payload ที่ฝังไว้ใน OAuth state */
interface OAuthStatePayload {
  organizationId: string;
  userId: string;
  platform: SocialPlatform;
}

/** บัญชีที่ส่งออก API — ตัด token ออกทุกกรณี */
export interface SocialAccountView {
  id: string;
  platform: string;
  externalId: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  connectionType: string;
  tokenExpiresAt: Date | null;
  connectedByUserId: string;
  createdAt: Date;
}

@Injectable()
export class SocialAccountService {
  private readonly logger = new Logger(SocialAccountService.name);

  /**
   * Meta ใช้ consent flow เดียวสำหรับทั้ง Facebook Page และ Instagram Business
   * จึง map ทั้งสอง platform ไปที่ provider ตัวเดียวกัน
   */
  private readonly providers: Readonly<Record<SocialPlatform, OAuthProvider>>;

  constructor(
    private readonly socialAccountRepo: SocialAccountRepository,
    private readonly orgMemberRepo: OrganizationMemberRepository,
    private readonly usersRepo: UsersRepository,
    private readonly socialTokenService: SocialTokenService,
    private readonly jwtService: JwtService,
    metaProvider: MetaOAuthProvider,
    tiktokProvider: TikTokOAuthProvider,
    youtubeProvider: YouTubeOAuthProvider,
  ) {
    this.providers = {
      FACEBOOK: metaProvider,
      INSTAGRAM: metaProvider,
      TIKTOK: tiktokProvider,
      YOUTUBE: youtubeProvider,
    };
  }

  private get cfg() {
    return configs().social;
  }

  /**
   * รายการบัญชีที่ org เชื่อมไว้ (ไม่รวม REVOKED)
   *
   * @param organizationId org ที่ต้องการดู
   * @returns บัญชีที่ตัด token ออกแล้ว เรียงตาม platform
   */
  async findManyByOrganization(
    organizationId: string,
  ): Promise<SocialAccountView[]> {
    const accounts = await this.socialAccountRepo.findMany({
      where: { organizationId, status: { not: 'REVOKED' } },
      orderBy: [{ platform: 'asc' }, { displayName: 'asc' }],
    });
    return accounts.map((account) => this.toView(account));
  }

  /**
   * สร้าง URL หน้า consent ของ platform
   *
   * @param platform platform ที่จะเชื่อม
   * @param organizationId org ที่บัญชีจะไปผูก
   * @param userId ผู้กดเชื่อม (ต้องเป็น OWNER/ADMIN ของ org)
   * @returns URL ให้ frontend เปิด popup
   * @throws ForbiddenException เมื่อผู้ใช้ไม่ใช่ admin ของ org
   * @throws BadRequestException เมื่อ platform ถูกปิดไว้ใน environment นี้
   */
  async buildConnectUrl(
    platform: SocialPlatform,
    organizationId: string,
    userId: string,
  ): Promise<{ authorizeUrl: string }> {
    await this.assertOrgAdmin(organizationId, userId);
    this.assertPlatformEnabled(platform);

    const statePayload: OAuthStatePayload = { organizationId, userId, platform };
    const state = await this.jwtService.signAsync(statePayload, {
      secret: this.requireStateSecret(),
      expiresIn: this.cfg.stateTtlSeconds,
    });

    const provider = this.providers[platform];
    return {
      authorizeUrl: provider.buildAuthorizeUrl(
        state,
        this.redirectUriFor(platform),
      ),
    };
  }

  /**
   * จบ OAuth flow — แลก code เป็น token แล้วบันทึกบัญชีทั้งหมดที่พบ
   *
   * @param platform platform จาก path (ต้องตรงกับที่ฝังไว้ใน state)
   * @param code authorization code จาก provider
   * @param state state ที่ sign ไว้ตอนเริ่ม flow
   * @returns จำนวนบัญชีที่บันทึก
   * @throws BadRequestException เมื่อ state ปลอม/หมดอายุ หรือ platform ไม่ตรง
   */
  async handleCallback(
    platform: SocialPlatform,
    code: string,
    state: string,
  ): Promise<{ connected: number }> {
    const payload = await this.verifyState(state);
    // กัน state ของ platform หนึ่งถูกเอาไปใช้กับอีก platform
    if (payload.platform !== platform) {
      throw new BadRequestException('OAuth state does not match the platform');
    }
    // ตรวจสิทธิ์ซ้ำอีกรอบ — สิทธิ์อาจถูกถอนระหว่างที่ผู้ใช้อยู่หน้า consent
    await this.assertOrgAdmin(payload.organizationId, payload.userId);

    const provider = this.providers[platform];
    const discovered = await provider.exchangeCode(
      code,
      this.redirectUriFor(platform),
    );
    if (discovered.length === 0) {
      throw new BadRequestException(
        'No postable account was found for this login',
      );
    }

    for (const account of discovered) {
      await this.upsertAccount(
        payload.organizationId,
        payload.userId,
        account,
      );
    }

    this.logger.log(
      `connected ${discovered.length} ${platform} account(s) to org ${payload.organizationId}`,
    );
    return { connected: discovered.length };
  }

  /**
   * บันทึก token ที่แอดมินระบบวางมือให้ org (เส้นทาง MANUAL)
   *
   * ทางออกระหว่างที่ app review ของ provider ยังไม่ผ่าน — แถวที่ได้ออกมาหน้าตา
   * เหมือน OAUTH ทุกอย่าง worker จึงใช้โพสต์ได้ทันทีโดยไม่ต้องรู้ว่า token มาจากไหน
   *
   * ตรวจ token กับ provider ก่อนเขียนลง DB เสมอ — token ที่พิมพ์ผิดหรือสิทธิ์ไม่ครบ
   * ดูด้วยตาไม่ออก ถ้าไม่ตรวจจะไปรู้ตอนโพสต์ล้มเหลว
   *
   * @param dto บัญชีและ token ที่จะบันทึก
   * @returns บัญชีที่บันทึกแล้ว (ไม่มี token ใน response)
   * @throws ForbiddenException เมื่อผู้กระทำไม่ใช่ SUPER_ADMIN
   * @throws BadRequestException เมื่อไม่มี token ให้ตรวจ หรือ provider ปฏิเสธ token
   */
  async saveManualToken(dto: SaveManualTokenDto): Promise<SocialAccountView> {
    await this.assertSuperAdmin(dto.userId);

    const existing = await this.socialAccountRepo.findOne({
      where: {
        organizationId: dto.organizationId,
        platform: dto.platform,
        externalId: dto.externalId,
      },
    });

    // ฟอร์มเป็น write-only: เว้น token ว่าง = คงค่าเดิม (แก้แค่ชื่อได้)
    // ถ้าเป็นแถวใหม่แล้วเว้นว่าง ก็ไม่มีอะไรให้เก็บ
    let accessToken = dto.accessToken;
    if (!accessToken) {
      if (!existing) {
        throw new BadRequestException(
          'An access token is required when adding a new account',
        );
      }
      accessToken = decryptSecret(existing.accessToken);
    }

    const verified = await this.verifyManualToken(
      dto.platform,
      dto.externalId,
      accessToken,
    );

    await this.upsertAccount(
      dto.organizationId,
      dto.userId,
      {
        platform: dto.platform,
        externalId: dto.externalId,
        displayName: dto.displayName?.trim() || verified.displayName,
        avatarUrl: verified.avatarUrl,
        accessToken,
        refreshToken: dto.refreshToken ?? null,
        // Meta Page token ไม่หมดอายุ — เก็บ null ไว้เพื่อให้ SocialTokenService
        // ไม่พยายามต่ออายุ (ซึ่งมันโยน error สำหรับ Meta อยู่แล้ว)
        tokenExpiresAt: dto.tokenExpiresAt ? new Date(dto.tokenExpiresAt) : null,
        scopes: [],
      },
      'MANUAL',
    );

    const saved = await this.socialAccountRepo.findOne({
      where: {
        organizationId: dto.organizationId,
        platform: dto.platform,
        externalId: dto.externalId,
      },
    });
    this.logger.log(
      `manual ${dto.platform} token stored for org ${dto.organizationId} by ${dto.userId}`,
    );
    return this.toView(saved!);
  }

  /**
   * ถอดบัญชีออกจาก org
   *
   * พยายามเพิกถอนสิทธิ์ฝั่ง provider ก่อน แต่ถ้าล้มเหลวก็ยัง mark REVOKED ต่อ —
   * ผู้ใช้สั่งถอดแล้ว ระบบเราต้องเลิกใช้บัญชีนั้นไม่ว่าปลายทางจะตอบอะไร
   *
   * @param id id ของ social_account
   * @param userId ผู้กดถอด (ต้องเป็น OWNER/ADMIN ของ org เจ้าของบัญชี)
   * @throws NotFoundException เมื่อไม่พบบัญชี
   */
  async disconnect(id: string, userId: string): Promise<{ id: string }> {
    const account = await this.socialAccountRepo.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('Social account not found');
    }
    await this.assertOrgAdmin(account.organizationId, userId);

    // token ที่แอดมินวางมือมาอาจถูกลูกค้าใช้ที่อื่นอยู่ด้วย — เพิกถอนฝั่ง provider
    // จะไปพังระบบอื่นของเขา จึงถอดแค่ในระบบเราเท่านั้น
    if (account.connectionType === 'MANUAL') {
      this.logger.log(
        `account ${id} is MANUAL — skipping provider revoke, marking REVOKED locally only`,
      );
    } else {
      try {
        const resolved = await this.socialTokenService.resolveAccount(id);
        await this.providers[account.platform as SocialPlatform].revoke({
          externalId: resolved.externalId,
          accessToken: resolved.accessToken,
        });
      } catch (error) {
        this.logger.warn(
          `provider revoke failed for account ${id}, marking REVOKED locally: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.socialAccountRepo.update({
      where: { id },
      data: { status: 'REVOKED' },
    });
    return { id };
  }

  /**
   * เขียนบัญชีลง DB แบบ upsert ตาม (org, platform, externalId)
   *
   * เชื่อมซ้ำ = อัปเดต token ใบเดิม ไม่สร้างแถวใหม่ และรีเซ็ตสถานะกลับเป็น ACTIVE
   * เพื่อให้บัญชีที่เคย EXPIRED กลับมาใช้ได้ทันที
   *
   * @param organizationId org เจ้าของ
   * @param userId ผู้เชื่อม
   * @param account บัญชีที่ได้จาก provider (token ยังไม่เข้ารหัส)
   * @param connectionType ที่มาของ token (default OAUTH)
   */
  private async upsertAccount(
    organizationId: string,
    userId: string,
    account: DiscoveredAccount,
    connectionType: SocialConnectionType = 'OAUTH',
  ): Promise<void> {
    const encrypted = {
      accessToken: encryptSecret(account.accessToken),
      // ไม่ทับ refresh token เดิมด้วย null ตอนแอดมินไม่ได้กรอกมาใหม่ —
      // ไม่งั้นการแก้แค่ชื่อจะทำให้บัญชีต่ออายุเองไม่ได้อีก
      ...(account.refreshToken && {
        refreshToken: encryptSecret(account.refreshToken),
      }),
    };

    await this.socialAccountRepo.upsert({
      where: {
        organizationId_platform_externalId: {
          organizationId,
          platform: account.platform,
          externalId: account.externalId,
        },
      },
      create: {
        organizationId,
        platform: account.platform,
        externalId: account.externalId,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        ...encrypted,
        tokenExpiresAt: account.tokenExpiresAt,
        scopes: [...account.scopes],
        status: 'ACTIVE',
        connectedByUserId: userId,
        connectionType,
      },
      update: {
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        ...encrypted,
        tokenExpiresAt: account.tokenExpiresAt,
        scopes: [...account.scopes],
        status: 'ACTIVE',
        connectedByUserId: userId,
        connectionType,
      },
    });
  }

  /**
   * ถาม provider ว่า token ที่วางมือใช้งานได้จริงไหม
   *
   * แปลง error ของ provider เป็น BadRequestException เพื่อให้ข้อความจริงไปโผล่ในฟอร์ม
   * ของแอดมิน (เช่น "Invalid OAuth access token") ไม่ใช่ 500 ที่บอกอะไรไม่ได้
   *
   * @param platform platform ของบัญชี
   * @param externalId id ฝั่ง provider
   * @param accessToken token ที่จะตรวจ
   * @returns ชื่อและรูปจาก provider
   * @throws BadRequestException เมื่อ provider ปฏิเสธ
   */
  private async verifyManualToken(
    platform: SocialPlatform,
    externalId: string,
    accessToken: string,
  ): Promise<{ displayName: string; avatarUrl: string | null }> {
    try {
      return await this.providers[platform].verifyToken(
        platform,
        externalId,
        accessToken,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Could not verify the token',
      );
    }
  }

  /**
   * ตรวจว่าผู้กระทำเป็นแอดมินระบบ (ไม่ใช่แค่แอดมินของ org)
   *
   * ใช้กับเส้นทาง MANUAL เท่านั้น เพราะการวาง token ดิบเป็นงานของทีมแพลตฟอร์ม
   *
   * @param userId ผู้กระทำ
   * @throws ForbiddenException เมื่อ role ไม่พอ
   */
  private async assertSuperAdmin(userId: string): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { userId } });
    // trim ก่อนเทียบ — ข้อมูล role ในระบบมีค่าที่ติดช่องว่างท้ายอยู่จริง
    const role = user?.role?.trim();
    if (!role || !SYSTEM_ADMIN_ROLES.includes(role)) {
      throw new ForbiddenException(
        'Only a system administrator can configure tokens manually',
      );
    }
  }

  /**
   * ตรวจว่าผู้ใช้เป็น OWNER/ADMIN ของ org
   *
   * @param organizationId org ที่จะกระทำ
   * @param userId ผู้กระทำ
   * @throws ForbiddenException เมื่อไม่ใช่สมาชิก หรือ role ไม่พอ
   */
  private async assertOrgAdmin(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const member = await this.orgMemberRepo.findOne({
      where: { organizationId, userId },
    });
    if (!member || !ADMIN_ROLES.includes(member.role)) {
      throw new ForbiddenException(
        'Only an organization OWNER or ADMIN can manage social accounts',
      );
    }
  }

  /**
   * ตรวจว่า platform ถูกเปิดใช้ใน environment นี้
   *
   * แต่ละ platform ต้องผ่าน app review คนละรอบ จึงต้องเปิดทีละเจ้าได้
   *
   * @param platform platform ที่จะเชื่อม
   * @throws BadRequestException เมื่อยังไม่เปิด
   */
  private assertPlatformEnabled(platform: SocialPlatform): void {
    if (!this.cfg.enabledPlatforms.includes(platform)) {
      throw new BadRequestException(
        `${platform} is not enabled in this environment`,
      );
    }
  }

  /**
   * ตรวจและถอด state token
   *
   * @param state JWT ที่ sign ตอนเริ่ม flow
   * @returns payload ที่ตรวจแล้ว
   * @throws BadRequestException เมื่อ state ไม่ถูกต้องหรือหมดอายุ
   */
  private async verifyState(state: string): Promise<OAuthStatePayload> {
    try {
      return await this.jwtService.verifyAsync<OAuthStatePayload>(state, {
        secret: this.requireStateSecret(),
      });
    } catch {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
  }

  /**
   * redirect_uri ต้องตรงกับที่ลงทะเบียนใน provider console ทุกตัวอักษร
   *
   * @param platform platform ที่จะเชื่อม
   * @returns redirect uri เต็ม
   * @throws BadRequestException เมื่อยังไม่ตั้ง base url
   */
  private redirectUriFor(platform: SocialPlatform): string {
    const base = this.cfg.callbackBaseUrl;
    if (!base) {
      throw new BadRequestException(
        'SOCIAL_OAUTH_CALLBACK_BASE_URL is not configured',
      );
    }
    return `${base.replace(/\/$/, '')}/${platform}`;
  }

  /**
   * อ่าน secret ที่ใช้ sign state — จงใจ throw ถ้าไม่มี ไม่ fallback ค่า default
   *
   * @returns secret
   * @throws BadRequestException เมื่อยังไม่ตั้ง env
   */
  private requireStateSecret(): string {
    const secret = this.cfg.stateSecret;
    if (!secret) {
      throw new BadRequestException(
        'SOCIAL_OAUTH_STATE_SECRET is not configured',
      );
    }
    return secret;
  }

  /**
   * ตัด field ที่เป็นความลับออกก่อนส่งกลับ client
   *
   * @param account แถวจาก DB
   * @returns view ที่ไม่มี token
   */
  private toView(account: {
    id: string;
    platform: string;
    externalId: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    connectionType: string;
    tokenExpiresAt: Date | null;
    connectedByUserId: string;
    createdAt: Date;
  }): SocialAccountView {
    return {
      id: account.id,
      platform: account.platform,
      externalId: account.externalId,
      displayName: account.displayName,
      avatarUrl: account.avatarUrl,
      status: account.status,
      connectionType: account.connectionType,
      tokenExpiresAt: account.tokenExpiresAt,
      connectedByUserId: account.connectedByUserId,
      createdAt: account.createdAt,
    };
  }
}
