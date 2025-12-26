import { registerAs } from '@nestjs/config';

export const appConfigs = registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4002,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
  storagePath: process.env.STORAGE_PATH,
}));

export const minioConfigs = registerAs('s3', () => ({
  minioEndpoint: (process.env.MINIO_ENDPOINT || '192.168.31.91').trim(),
  minioPort: parseInt(process.env.MINIO_PORT || '9000', 10),
  minioAccesskey: process.env.MINIO_ACCESSKEY,
  minioSecretKey: process.env.MINIO_SECRETKEY,
  minioBucket: process.env.MINIO_BUCKET,
  minioBucketUpload: process.env.MINIO_BUCKET_UPLOAD,
  minioBucketFile: process.env.MINIO_BUCKET_FILE,
  minioBucketVdo: process.env.MINIO_BUCKET_VDO,
  minioUseSsl: process.env.MINIO_USE_SSL === 'true',
}));

export const byteplusConfigs = registerAs('byteplus', () => ({
  byteplusAccessKeyId:
    process.env.BYTEPLUS_ACCESS_KEY ||
    'AKAPYzE5OGNhNmRkZDVlNDllYzlhM2MwNTU3MTE0YWM4ZGM',
  byteplusSecretKey:
    process.env.BYTEPLUS_SECRET_KEY ||
    'T1RnM09HSTJNVFEwWmpBek5EY3lNMkZqWmpabE5tWm1aR0ZrT0dabU9UVQ==',
}));
// pathDomain: process.env.PATH_DOMAIN,
// pathDomainVDO: process.env.PATH_DOMAIN_VDO,
// pathPublicDomain: process.env.PATH_PUBLIC_DOMAIN,
// pathPublicIp: process.env.PATH_PUBLIC_IP,