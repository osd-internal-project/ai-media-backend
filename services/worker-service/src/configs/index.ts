import { registerAs } from '@nestjs/config';

export const appConfigs = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 5000,
  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://user:password@localhost:5672',
  minioEndpoint: (process.env.MINIO_ENDPOINT || '192.168.31.91').trim(),
  minioPort: parseInt(process.env.MINIO_PORT || '9000', 10),
  minioAccesskey: process.env.MINIO_ACCESSKEY,
  minioSecretKey: process.env.MINIO_SECRETKEY,
  minioBucket: process.env.MINIO_BUCKET,
  minioBucketUpload: process.env.MINIO_BUCKET_UPLOAD,
  minioBucketFile: process.env.MINIO_BUCKET_FILE,
  minioBucketVdo: process.env.MINIO_BUCKET_VDO,
  minioUseSsl: process.env.MINIO_USE_SSL === 'true',
  storagePath: process.env.STORAGE_PATH,
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
  redisPassword: process.env.REDIS_PASSWORD,
}));