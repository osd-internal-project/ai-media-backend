# Public Social — setup

Feature: a member picks items from the gallery, writes a caption, picks target
platforms and submits a **share task**. An organization OWNER/ADMIN approves or
rejects it. Once approved the member presses **Send** and a worker publishes to
the real platform APIs.

## Moving parts

| Piece | Where |
|---|---|
| Tables `activity_share`, `activity_share_target`, `activity_share_log`, `social_account` | `libs/prisma/schema.prisma`, migration `20260807101035_activity_share` |
| Shared constants, types, token refresh | `libs/share/src/social/` |
| Token encryption | `libs/share/src/utils/crypto.util.ts` |
| OAuth connect/callback/disconnect | `services/users/src/social-account/` |
| Task CRUD + approval workflow | `services/core/src/activity-share/` |
| Publishing worker + platform drivers | `services/worker-service/src/social-publish/` |
| UI | `ai-media-frontend/app/page/project/[id]/components/tabs/public-social/` |

## Status flow

```
NEW ──approve──> APPROVED ──send──> PENDING ──worker──> PUBLISHING ──> SUCCESS
 │                                                           │
 └──reject──> REJECTED ──edit──> NEW                         └──> FAILED ──retry──> PENDING
```

`PUBLISHING` and `FAILED` exist because publishing is asynchronous and can fail
per-platform. Every transition is validated against `ALLOWED_TRANSITIONS`
(`libs/share/src/social/social.constants.ts`) and writes one `activity_share_log`
row inside the same transaction. Nothing writes `status` directly.

## Environment variables

All new. Set on **users** (OAuth) and **worker-service** (publishing); the
encryption key is needed by both.

### Required by users + worker-service

```bash
# 32 bytes, hex-encoded. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Losing this key makes every stored token undecryptable — accounts must be reconnected.
# The users service refuses to start without it *when* SOCIAL_ENABLED_PLATFORMS is non-empty;
# deployments that have not adopted the feature are unaffected.
SOCIAL_TOKEN_ENC_KEY=
```

### Required by users service only

```bash
# Which platforms the Connect buttons may start. Comma separated.
# Ship one at a time as each app review clears, e.g. "FACEBOOK".
SOCIAL_ENABLED_PLATFORMS=FACEBOOK

# Signs the OAuth `state` token so a callback cannot be replayed onto another org.
SOCIAL_OAUTH_STATE_SECRET=
SOCIAL_OAUTH_STATE_TTL=600

# Base of the redirect_uri. The platform is appended: .../callback/FACEBOOK
# Must match the provider console entry exactly.
SOCIAL_OAUTH_CALLBACK_BASE_URL=https://<api-host>/api/social-account/callback

# Where the popup lands after the flow (gets ?social=success|error&message=…)
SOCIAL_OAUTH_FRONTEND_RETURN_URL=https://<web-host>/social-callback

META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v21.0

TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=

GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

### Required by worker-service only

```bash
META_GRAPH_API_VERSION=v21.0
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=

# Keep SELF_ONLY until the TikTok content-posting audit passes —
# un-audited apps cannot post publicly.
TIKTOK_PRIVACY_LEVEL=SELF_ONLY

# public | unlisted | private
YOUTUBE_PRIVACY_STATUS=private
```

## Connecting an account

Two paths produce the same `social_account` row. The worker cannot tell them apart —
that is deliberate.

### 1. OAuth (self-service, needs app review)

Org **OWNER/ADMIN** → project → Public Social → Connections → **Connect**. Opens the
provider consent popup, lands on `/social-callback`, upserts one row per discovered
account. Connecting Facebook also creates the Instagram row (one Meta consent returns
Pages + linked IG Business accounts).

### 2. Manual token (SUPER_ADMIN, works before app review)

Same Connections page → **Configure token**, visible only to `users.role = SUPER_ADMIN`
(or `SYSTEM_ADMIN`). Paste the platform id + access token; `POST /social-account/manual`
**verifies the token against the provider before writing**, so a wrong or under-scoped
token is rejected up front with the provider's own error message rather than failing on a
post days later.

| Platform | id to paste | Also needs |
|---|---|---|
| Facebook | Page ID | long-lived **Page** token (not a user token); never expires |
| Instagram | IG Business user ID | the same Page token works |
| TikTok | `open_id` | **refresh token** — access tokens die in ~24h |
| YouTube | Channel ID | **refresh token** — access tokens die in ~1h |

The form is write-only: tokens are never returned by the API, and leaving the token field
blank when editing keeps the stored value (so you can fix a display name without
re-pasting). Refresh for TikTok/YouTube uses the **global** `TIKTOK_CLIENT_*` /
`GOOGLE_OAUTH_*` env credentials, so those must still be set even for manual accounts.

Manual rows are tagged `MANUAL` in the UI and behave differently in one place:
**disconnect does not call the provider's revoke endpoint**, because a pasted token may be
in use elsewhere by the customer. The row is marked `REVOKED` locally only.

Because this is a SUPER_ADMIN action inside a per-project tab, staff must switch into the
customer's organization to configure it. If that becomes the common workflow, move the form
to a dedicated `/page/admin-management/social-config` page with an org picker.

## Provider setup (not code — allow weeks of lead time)

- **Facebook Page + Instagram** — one Meta app. Scopes: `pages_show_list`,
  `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`,
  `instagram_content_publish`, `business_management`. All need **App Review**.
  Instagram requires a Business/Creator account linked to a Page; one consent
  flow creates both the FACEBOOK and INSTAGRAM rows.
- **TikTok** — scopes `user.info.basic`, `video.publish`, `video.upload`.
  Public posting requires the **content-posting audit**.
- **YouTube** — Google Cloud OAuth client, scope
  `https://www.googleapis.com/auth/youtube.upload`. `videos.insert` costs
  **1600 quota units**; the default 10,000/day allows ~6 uploads. Request a
  quota extension before real use.

## Frontend gating

The tab is gated on the organization access code containing `social`
(`Organization.accessCodes`). Orgs without it never see the tab. Approvals and
Connections sub-views additionally require `OrganizationMember.role` in
`OWNER`/`ADMIN`.

## Things worth knowing

- **DB stores TOS object keys, never URLs.** `media_items` is a frozen snapshot
  taken at submit time (via `buildOutputKey`), so a reviewer still sees what
  they approved even if the gallery row is deleted afterwards.
- **Instagram must pull the media from a public HTTPS URL.** The worker uses
  `StorageUrlService.toProviderUrl` (the hard-failing send path). Verify the TOS
  presign TTL comfortably exceeds Meta's fetch window — Reels transcoding can
  take minutes. This is the most likely first failure in production.
- **TikTok uses FILE_UPLOAD, not PULL_FROM_URL** — the latter requires verifying
  ownership of the URL's domain, which we do not control on TOS.
- **Facebook and Instagram pull from URL**, so the worker never buffers those
  files; TikTok and YouTube are downloaded into memory first.
- **Retry only re-posts FAILED targets.** Targets that already succeeded are
  untouched, so retry cannot double-post.
- **Send is guarded by a conditional update** (`updateMany where status:APPROVED`,
  then `count === 1`), so a double click cannot enqueue twice.
- Authorization follows the existing inline convention (resolve `userId`, look up
  `OrganizationMember.role`). This codebase has **no `@UseGuards` anywhere**;
  introducing a real `RolesGuard` is a worthwhile follow-up but was left out of
  scope.
- The old quick-share path (`useSocialShare.ts` / `share-modal.tsx` in the All
  Activity tab) is untouched and still works. The new flow is a separate
  "Publish to social" action.
