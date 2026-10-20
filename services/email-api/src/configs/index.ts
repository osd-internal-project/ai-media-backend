import { registerAs } from '@nestjs/config';

/**
 * Runtime config for email-api.
 *
 * Mail is sent unauthenticated through OSD's Office 365 direct-send relay
 * (reached locally via an SSH tunnel on localhost:2525). The relay only
 * delivers to recipients that have a live @osd.co.th mailbox; other recipients
 * are rejected by Office 365.
 */
export const appConfigs = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 5000,
  EMAIL_HOST: process.env.EMAIL_HOST || 'localhost',
  EMAIL_PORT: process.env.EMAIL_PORT || 2525,
  EMAIL_SECURE: process.env.EMAIL_SECURE === 'true',
  EMAIL_HELO: process.env.EMAIL_HELO || 'osd.co.th',
  EMAIL_TLS_SERVERNAME:
    process.env.EMAIL_TLS_SERVERNAME || 'osd-co-th.mail.protection.outlook.com',
  EMAIL_FROM: process.env.EMAIL_FROM || '"OSD Support" <osdsupport@osd.co.th>',
}));
