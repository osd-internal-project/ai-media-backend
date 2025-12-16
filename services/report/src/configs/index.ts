export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4000,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
  pathDomain: process.env.PATH_DOMAIN,
});
