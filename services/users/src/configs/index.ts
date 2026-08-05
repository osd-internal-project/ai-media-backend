export default () => ({
  env: process.env.NODE_ENV ?? 'local',
  port: process.env.PORT || 4000,
  pathMountDirUpload: process.env.PATH_MOUNTDIR_UPLOAD,
  pathDomain: process.env.PATH_DOMAIN,
  frontendUrl: process.env.FRONTEND_URL,
  keycloak: {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    redirectUri: process.env.KEYCLOAK_REDIRECT_URI,
    /**
     * `kc_idp_hint` aliases of the brokered identity providers, as configured in the
     * Keycloak realm. Google uses Keycloak's built-in social provider; Microsoft/Entra is
     * usually added as a custom OIDC provider whose alias the realm admin chooses, so it is
     * configurable rather than hardcoded.
     */
    idpAliases: {
      google: process.env.KEYCLOAK_IDP_GOOGLE_ALIAS || 'google',
      microsoft: process.env.KEYCLOAK_IDP_MICROSOFT_ALIAS || 'microsoft',
    },
  },
  emailApiUrl: process.env.EMAIL_API_URL || 'http://localhost:5000',
  omise: {
    secretKey: process.env.OMISE_SECRET_KEY,
    apiUrl: process.env.OMISE_API_URL || 'https://api.omise.co',
    apiVersion: process.env.OMISE_API_VERSION || '2019-05-29',
  },
});
