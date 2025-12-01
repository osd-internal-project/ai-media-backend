export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4002,
  minioEndpoint: (process.env.MINIO_ENDPOINT || '192.168.31.91').trim(),
  minioPort: parseInt(process.env.MINIO_PORT || '9000', 10),
  minioAccesskey: process.env.MINIO_ACCESSKEY,
  minioSecretKey: process.env.MINIO_SECRETKEY,
  minioBucket: process.env.MINIO_BUCKET || '',
});
