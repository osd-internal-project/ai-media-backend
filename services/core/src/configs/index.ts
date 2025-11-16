export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4002,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
});
