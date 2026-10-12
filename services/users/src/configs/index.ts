export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4000,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
  pathDomain: process.env.PATH_DOMAIN,
  frontendUrl: process.env.FRONTEND_URL,
  keycloak: {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    redirectUri: process.env.KEYCLOAK_REDIRECT_URI,
    /**
     * `kc_idp_hint` aliases of the brokered identity providers, as configured in the
     * Keycloak realm. Google uses Keycloak's built-in social provider; Microsoft/Entra is
     * usually added as a custom OIDC provider whose alias the realm admin chooses, so it is
     * configurable rather than hardcoded.
     */
    idpAliases: {
      google: process.env.KEYCLOAK_IDP_GOOGLE_ALIAS || 'google',
      microsoft: process.env.KEYCLOAK_IDP_MICROSOFT_ALIAS || 'microsoft',
    },
  },
  emailApiUrl: process.env.EMAIL_API_URL || 'http://localhost:5000',
  /** base URL ของ core รวม `/api` — ใช้ปลุก socket noti คำเชิญ; ว่าง = ไม่ส่ง */
  coreApiUrl: process.env.CORE_API_URL,
  /** ปิดการรับชำระเงิน (Omise) ทั้งหมดเมื่อไม่ใช่ `true` — org ถูกสร้างโดย admin */
  billingEnabled: process.env.BILLING_ENABLED === 'true',
  omise: {
    secretKey: process.env.OMISE_SECRET_KEY,
    apiUrl: process.env.OMISE_API_URL || 'https://api.omise.co',
    apiVersion: process.env.OMISE_API_VERSION || '2019-05-29',
  },
  /**
   * Public Social — OAuth ของ social platform ที่ org เอาไว้เชื่อมบัญชี
   *
   * `enabledPlatforms` ใช้เปิด/ปิดรายแพลตฟอร์มต่อ environment เพราะแต่ละเจ้าต้องผ่าน
   * app review คนละรอบ (Meta App Review, TikTok content-posting audit, YouTube quota)
   * จึงต้อง ship ทีละเจ้าได้โดยไม่ต้องแก้โค้ด
   */
  social: {
    enabledPlatforms: (process.env.SOCIAL_ENABLED_PLATFORMS || '')
      .split(',')
      .map((platform) => platform.trim().toUpperCase())
      .filter(Boolean),
    /** secret สำหรับ sign `state` ของ OAuth (กัน CSRF / การสลับ org) */
    stateSecret: process.env.SOCIAL_OAUTH_STATE_SECRET,
    /** อายุของ state token (วินาที) — สั้นพอที่จะกัน replay */
    stateTtlSeconds: Number(process.env.SOCIAL_OAUTH_STATE_TTL || 600),
    /** base ของ redirect_uri เช่น https://api.example.com/api/social-account/callback */
    callbackBaseUrl: process.env.SOCIAL_OAUTH_CALLBACK_BASE_URL,
    /** หน้าที่จะเด้งกลับหลังเชื่อมบัญชีเสร็จ (มี ?social=success|error ต่อท้าย) */
    frontendReturnUrl: process.env.SOCIAL_OAUTH_FRONTEND_RETURN_URL,
    meta: {
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      apiVersion: process.env.META_GRAPH_API_VERSION || 'v21.0',
    },
    tiktok: {
      clientKey: process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    },
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    },
  },
});
