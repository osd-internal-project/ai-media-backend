export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4002,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
  pathDomain: process.env.PATH_DOMAIN,
  pathDomainVDO: process.env.PATH_DOMAIN_VDO,
  pathPublicDomain: process.env.PATH_PUBLIC_DOMAIN,
  pathPublicIp: process.env.PATH_PUBLIC_IP,
  minioEndpoint: (process.env.MINIO_ENDPOINT || '192.168.31.91').trim(),
  minioPort: parseInt(process.env.MINIO_PORT || '9000', 10),
  minioAccesskey: process.env.MINIO_ACCESSKEY,
  minioSecretKey: process.env.MINIO_SECRETKEY,
  minioBucket: process.env.MINIO_BUCKET,
  minioBucketUpload: process.env.MINIO_BUCKET_UPLOAD,
  minioBucketFile: process.env.MINIO_BUCKET_FILE || 'ai-media-file',
  minioUseSsl: process.env.MINIO_USE_SSL === 'true',

  minioBucketVdo: process.env.MINIO_BUCKET_VDO,
  byteplusAccessKeyId:
    process.env.BYTEPLUS_ACCESS_KEY ||
    'AKAPYzE5OGNhNmRkZDVlNDllYzlhM2MwNTU3MTE0YWM4ZGM',
  byteplusSecretKey:
    process.env.BYTEPLUS_SECRET_KEY ||
    'T1RnM09HSTJNVFEwWmpBek5EY3lNMkZqWmpabE5tWm1aR0ZrT0dabU9UVQ==',
});
