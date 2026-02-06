import { registerAs } from '@nestjs/config';

export const appConfigs = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 5000,
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT) || 6379,
}));