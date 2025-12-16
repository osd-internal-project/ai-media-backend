export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4002,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
  pathDomain: process.env.PATH_DOMAIN,
  pathDomainVDO: process.env.PATH_DOMAIN_VDO,
  minioEndpoint: (process.env.MINIO_ENDPOINT || '192.168.31.91').trim(),
  minioPort: parseInt(process.env.MINIO_PORT || '9000', 10),
  minioAccesskey: process.env.MINIO_ACCESSKEY,
  minioSecretKey: process.env.MINIO_SECRETKEY,
  minioBucket: process.env.MINIO_BUCKET,
  minioBucketUpload: process.env.MINIO_BUCKET_UPLOAD,
  minioBucketVdo: process.env.MINIO_BUCKET_VDO,
});
