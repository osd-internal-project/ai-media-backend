import { registerAs } from '@nestjs/config';

export const appConfigs = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4002,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
  storagePath: process.env.STORAGE_PATH,
  emailApiUrl: process.env.EMAIL_API_URL,
  receiveEmail: process.env.RECEIVE_EMAIL,
}));

export const byteplusConfigs = registerAs('byteplus', () => ({
  byteplusAccessKeyId:
    process.env.BYTEPLUS_ACCESS_KEY ||
    'AKAPYzE5OGNhNmRkZDVlNDllYzlhM2MwNTU3MTE0YWM4ZGM',
  byteplusSecretKey:
    process.env.BYTEPLUS_SECRET_KEY ||
    'T1RnM09HSTJNVFEwWmpBek5EY3lNMkZqWmpabE5tWm1aR0ZrT0dabU9UVQ==',
}));

export const redisConfigs = registerAs('redis', () => ({
  redisHost: process.env.REDIS_HOST,
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD,
}));

export const tosConfigs = registerAs('tos', () => ({
  tosBucket: process.env.TOS_BUCKET,
  tosAccessKey: process.env.TOS_ACCESS_KEY,
  tosSecretKey: process.env.TOS_SECRET_KEY,
  tosRegion: process.env.TOS_REGION,
  tosEndpoint: process.env.TOS_ENDPOINT,
}));
export const llmConfigs = registerAs('llm', () => ({
  llmGatewayUrl: process.env.LLM_GATEWAY_URL || 'https://llmgateway.osd.co.th',
  llmProjectId: process.env.LLM_PROJECT_ID || 'team-mrcx7er7', //AI Cave Lab
  llmProjectName: process.env.LLM_PROJECT_NAME || 'AI Cave Lab',
  llmAdminToken: process.env.LLM_ADMIN_TOKEN,
}));
