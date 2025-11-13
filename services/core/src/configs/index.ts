export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4002,
  id24Url: process.env.ID24_URL || 'http://192.168.59.191:8815',
  id24TokenPublicKey: process.env.ID24_TOKEN_PUBLIC_KEY,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
});
