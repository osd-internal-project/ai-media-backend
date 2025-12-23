export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4000,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
  pathDomain: process.env.PATH_DOMAIN,
  keycloak: {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  },
});
