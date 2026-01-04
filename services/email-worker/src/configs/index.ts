import { registerAs } from '@nestjs/config';

export const appConfigs = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 5000,
  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://user:password@localhost:5672',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER || 'kanokphon.dev@gmail.com',
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || 'password',
  SMTP_FROM: process.env.SMTP_FROM || 'kanokphon.dev@gmail.com',
}));