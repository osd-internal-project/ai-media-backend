# AI Cave ↔ Community API contract

Status: draft for agreement with the Community (Foundise) team. Version 0.1, 2026-10-30.

This document defines every call between AI Cave core and Community in Phase 1
(publish only, no sales). Field names are case-sensitive. All bodies are JSON (UTF-8).

## Identity

AI Cave and Community share the Keycloak realm `eportal`. A creator is the same
person on both sides when the Keycloak `sub` matches. AI Cave sends `sub` as
`creator.keycloakSub`.

Community gets its own Keycloak client in `eportal`. AI Cave accepts its user tokens
after the client ID is added to `KEYCLOAK_ALLOWED_CLIENTS` on core.

## AI Cave → Community

AI Cave calls the base URL that Community provides (`COMMUNITY_API_BASE_URL`), with
header `x-api-key: <key issued by Community>`. Timeout is 15 seconds.

### PUT /items/{aicavePublicationId}

Creates or replaces one published work. AI Cave sends the same ID again when the
creator publishes the same work again, so the call must be idempotent: the same ID
updates the same item.

```json
{
  "aicavePublicationId": "6f1c…",
  "creator": { "keycloakSub": "1b2c…", "fullname": "Somchai" },
  "organizationId": "org-…",
  "visibility": "PUBLIC",
  "type": "video",
  "modelName": "seedance-1-0-pro",
  "prompt": null,
  "media": [
    {
      "type": "video",
      "url": "https://api.aicave.ai/public/community-publication/6f1c…/media/0",
      "thumbnailUrl": "https://api.aicave.ai/public/community-publication/6f1c…/media/0?thumbnail=1"
    }
  ],
  "createdAt": "2026-10-30T08:00:00.000Z"
}
```

| Field | Notes |
|---|---|
| `visibility` | `PUBLIC` shows the work to everyone. `PRIVATE` shows it to the creator only. |
| `type` | `image`, `video`, `omnihuman`, `dreamactor` or `audio`. |
| `prompt` | `null` unless the creator chose to show it. Do not request it separately. |
| `media[].url` | Stable URL. It answers `302` to a short-lived signed URL, so fetch with redirects on. Store the stable URL, not the signed one. |
| `media[].thumbnailUrl` | Same rule. Returns `404` when the work has no thumbnail, for example audio. |

Response: any `2xx`. If the body has a string `id`, AI Cave stores it as the
Community item ID. Any other status marks the work `FAILED` on AI Cave with the
error text, and the creator can publish again.

The media URLs answer only while the work is waiting for review or published. After
rejection or removal they return `404`.

### DELETE /items/{aicavePublicationId}

AI Cave calls this when the creator or an organization admin removes the work.
Answer `2xx`, or `404` when the item is already gone. AI Cave then deletes its
preview copies.

## Community → AI Cave

Base URL: the AI Cave core API, for example `https://api.aicave.ai`.

### POST /community/link

Links a Community account to the AI Cave creator. Call it with the user's own access
token from `eportal`:

```
Authorization: Bearer <user access token>
```

No body. Response `200`:

```json
{
  "userId": "…",
  "keycloakSub": "1b2c…",
  "fullname": "Somchai",
  "email": "somchai@example.com",
  "linkedAt": "2026-10-30T08:00:00.000Z",
  "organizations": [{ "organizationId": "org-…", "name": "Studio A", "role": "OWNER" }]
}
```

Errors: `401` when the token is missing, expired or from a client AI Cave does not
accept. `404` when the user does not exist in AI Cave.

### POST /community/webhook

Reports a review result or a removal on the Community side. Authenticate with the API
key that an AI Cave admin issues (scope `webhook`):

```
x-api-key: aick_…
```

```json
{
  "aicavePublicationId": "6f1c…",
  "event": "APPROVED",
  "communityItemId": "item-123",
  "reason": null
}
```

| `event` | Effect on AI Cave |
|---|---|
| `APPROVED` | Waiting for review becomes published. |
| `REJECTED` | The work becomes rejected. `reason` is shown to the creator. |
| `REMOVED` | Community took the work down. |

Response `200` with `{ "status": "PUBLISHED" }` (the new status). Sending the same
event twice returns `200` again. Errors:

| Status | Meaning |
|---|---|
| `401` | Header missing, key unknown or revoked. |
| `403` | Key lacks scope `webhook`. |
| `404` | No publication with that ID. |
| `409` | The event does not apply to the current status, for example `APPROVED` after the creator removed the work. Do not retry. |

### Original files (Phase 2)

Phase 1 has no endpoint for original files. Phase 2 adds
`POST /community/publications/{id}/original-link` with scope `original`; it requires
an order ID and returns a short-lived signed URL.

## Setup checklist

| Item | Owner |
|---|---|
| Keycloak client for Community in `eportal`, ID added to `KEYCLOAK_ALLOWED_CLIENTS` | AI Cave |
| API key with scope `webhook` issued at Admin → API Keys, sent over a secure channel | AI Cave |
| `COMMUNITY_API_BASE_URL` and `COMMUNITY_API_KEY` set on core | AI Cave, values from Community |
| `COMMUNITY_PUBLIC_API_BASE_URL` set on core (origin of the media URLs) | AI Cave |
| `PUT` / `DELETE /items/{id}` implemented and idempotent | Community |
| Webhook calls on review and removal | Community |
