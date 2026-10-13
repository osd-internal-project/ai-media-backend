# Auth rollout — Keycloak token on every API

Every HTTP route in core, users, worker-service, chat-assistant and report now passes through
`KeycloakAuthGuard` (`libs/share/src/auth`). The socket gateway in core checks the token on connect.
How strict the check is depends on the `AUTH_MODE` environment variable, so backend and frontend
can be deployed separately.

| `AUTH_MODE` | Missing / invalid token | `userId` in the request belongs to someone else |
|---|---|---|
| `off` (default when unset) | allowed, not checked | allowed, not checked |
| `report` (charts ship with this) | allowed, logged as `[auth:report] would 401 …` | allowed, logged as `[auth:report] would 403 …` |
| `enforce` | `401` | `403` (except `SUPER_ADMIN`) |

## What is checked

- The token must be a Keycloak RS256 access token, signed by a key from
  `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`.
- `iss` must equal `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`.
- `exp` and `nbf` are checked with 60 s of clock skew.
- `azp` must be listed in `KEYCLOAK_ALLOWED_CLIENTS` (comma separated). If the list is empty,
  every token is rejected.
- The token's `sub` must match `users.token` of a user whose status is not deleted, banned or inactive.
  Users are cached for 5 minutes.
- Any `userId` in the query, the route params or a JSON body must be the token user's `userId` or `token`.
  The guard runs before multer, so multipart bodies are checked inside the handler instead
  (see worker `UploadAccessService.assertSameUser`).
- worker uploads (policy, presign, confirm, from-prompt, delete) also require membership:
  - The user must be a member of the organization.
  - The project must belong to that organization.
  - The user must be a member of the project, or an org `OWNER` / `ADMIN`.

## Routes without a token (`@Public()`)

| Service | Route | Protected by |
|---|---|---|
| worker | `POST upload/callback` | HMAC of the signed scope |
| core | `POST webhooks/byteplus/video/:taskId` | provider status re-check |
| core | `public/community/*`, `public/photo-event/*` | public by design |
| core | `POST websocket/notify/invitation` | `x-internal-key` = `INTERNAL_API_KEY` |
| users | `auth/*`, `public/*` | login flow / public files |
| users | `POST invoice/webhook/omise` | billing flag |
| users | `GET social-account/callback/:platform` | signed OAuth state |
| report | `public/*` | public files |
| chat-assistant | `GET health` | k8s probe |

Keep this table in sync when you add a webhook or public page. Any route that is not public needs a
Bearer token once `enforce` is on. core's `public-routes.spec.ts` fails if `@Public()` is removed from
its routes.

## Environment

| Variable | Where | Value |
|---|---|---|
| `AUTH_MODE` | core, users, worker, chat-assistant, report | `off` / `report` / `enforce` |
| `KEYCLOAK_URL`, `KEYCLOAK_REALM` | same five | e.g. `https://id24.aicave.ai`, `eportal` |
| `KEYCLOAK_ALLOWED_CLIENTS` | same five | e.g. `ai-cave-prod` |
| `INTERNAL_API_KEY` | users + core (from `secretEnv`, optional key) | any long random string |

## Rollout steps

1. **Create the secret.** Add the GitHub Actions secret `INTERNAL_API_KEY` (any long random string).
   `_deploy-service.yml` passes it to every service as `--set secretEnv.INTERNAL_API_KEY`, so users and
   core get the same value. Until the secret exists the value is empty: core accepts the notify call
   while `AUTH_MODE` is not `enforce`, and rejects it once it is.
2. **Deploy the backend.** Charts set `AUTH_MODE=report`. Behaviour is unchanged; the logs start
   showing `[auth:report]` lines.
3. **Check the client id first.** If the logs show `unexpected client <id>`, the frontend's
   `KEYCLOAK_CLIENT_ID` is not in the allowlist. Add it to `keycloakAllowedClients` in every chart.
4. **Deploy the frontend.** It sends `Authorization: Bearer` on every axios call, sends the token in
   the socket.io handshake, sends it as a header on the chat stream, and refreshes the access token
   5 minutes before it expires.
5. **Watch the `report` logs for 1–2 days.** Afterwards, the only remaining lines should be:
   - real anonymous traffic, and
   - `would 403` lines for flows that legitimately send another user's `userId`
     (admin user management, invitations). Fix these before enforcing.
6. **Enforce one service at a time.** Set `AUTH_MODE=enforce` in this order:
   worker → core → chat-assistant → report → users. Roll back by setting it back to `report`;
   no rebuild is needed.

## Troubleshooting

| Log reason | Cause |
|---|---|
| `missing bearer token` | The caller does not send a token (a page not using the shared axios instances, or a new webhook missing `@Public()`). |
| `token expired` | Frontend refresh is failing. Check the frontend logs for `RefreshAccessTokenError`. |
| `unexpected client X` | Add `X` to `KEYCLOAK_ALLOWED_CLIENTS`. |
| `unexpected issuer …` | `KEYCLOAK_URL` / `KEYCLOAK_REALM` of the service differ from the realm that issued the token (UAT uses `id24-uat`). |
| `no active user for sub …` | The Keycloak user has no `users.token` row, or the user is deleted, banned or inactive. |
| `userId … does not belong to token user …` | The request carries another user's id. Expected only for `SUPER_ADMIN`. |
