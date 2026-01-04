import { registerAs } from '@nestjs/config';

export const appConfigs = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 5000,
  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://user:password@localhost:5672',
}));