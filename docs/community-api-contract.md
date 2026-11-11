# AI Cave ↔ Community API contract

Status: draft for agreement with the Community (Foundise) team. Version 0.2, 2026-11-08.

This document defines every call between AI Cave core and Community in Phase 1
(publish only, no sales). AI Cave does not call Community. When a creator publishes a
work from an organization gallery, AI Cave copies it to a separate store and lists it
right away. Community pulls the list with an API key. Field names are case-sensitive. All bodies are JSON (UTF-8).

## Identity

AI Cave and Community share the Keycloak realm `eportal`. A creator is the same
person on both sides when the Keycloak `sub` matches. AI Cave sends `sub` as
`creator.keycloakSub`.

Community gets its own Keycloak client in `eportal`. AI Cave accepts its user tokens
after the client ID is added to `KEYCLOAK_ALLOWED_CLIENTS` on core.

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

### GET /integration/publications

Lists the works that are published and visible to everyone (`PUBLISHED` and
`PUBLIC`), newest first. Authenticate with an API key that has scope `media:read`:

```
x-api-key: aick_…
```

| Query | Notes |
|---|---|
| `organizationId` | Optional. Returns only the works of this organization. Leave it out for every organization. |
| `updatedSince` | Optional ISO date. Returns only works updated at or after this time. |
| `type` | Optional. `image`, `video`, `omnihuman`, `dreamactor` or `audio`. |
| `modelName` | Optional. Exact model name, for example `seedream-4-0`. |
| `publishedFrom` / `publishedTo` | Optional ISO dates. Returns works published within this range, both ends included. |
| `take` | Optional, 1 to 100. Default 50. |
| `skip` | Optional, 0 or more. Default 0. |

Response `200`. Results are sorted by `publishedAt`, then `id`, both descending:

```json
{
  "items": [
    {
      "id": "6f1c…",
      "organizationId": "org-…",
      "organizationName": "Studio A",
      "type": "image",
      "modelName": "seedream-4-0",
      "prompt": null,
      "media": [
        {
          "type": "image",
          "url": "https://api.aicave.ai/public/community-publication/6f1c…/media/0",
          "thumbnailUrl": "https://api.aicave.ai/public/community-publication/6f1c…/media/0?thumbnail=1"
        }
      ],
      "visibility": "PUBLIC",
      "publishedAt": "2026-11-01T08:00:00.000Z",
      "updatedAt": "2026-11-01T08:00:00.000Z"
    }
  ],
  "total": 1,
  "take": 50,
  "skip": 0
}
```

| Field | Notes |
|---|---|
| `organizationName` | `null` when the organization no longer exists. |
| `type` | `image`, `video`, `omnihuman`, `dreamactor` or `audio`. |
| `prompt` | `null` unless the creator chose to show it. |
| `visibility` | `PUBLIC` (everyone on Community) or `PRIVATE` (only the creator). This endpoint returns only `PUBLIC`. |
| `media[].url` | Stable URL that you can put in `<img src>`. It answers `302` to a short-lived signed URL, so fetch with redirects on. Store the stable URL, not the signed one. |
| `media[].thumbnailUrl` | Same rule. Returns `404` when the work has no thumbnail, for example audio. |
| `total` | Number of works that match the query, for paging. |

The response holds links, not files. When the creator or an organization admin removes
a work, it drops out of the list and its media URLs return `404`. To find works that
are gone, compare the full list of `id`s.

Works published while you page can shift items across page edges. Use `updatedSince`
for incremental syncs.

Errors: `400` for invalid query values. `401` when the key is missing, unknown or
revoked. `403` when the key lacks scope `media:read`.

### GET /integration/me/publications

Lists the published works (`PUBLISHED`) that the signed-in user created, both `PUBLIC`
and `PRIVATE`. Community decides who sees a `PRIVATE` work: show it only to its creator.
Send both the user's Keycloak token and the API key:

```
Authorization: Bearer <user access token>
x-api-key: aick_…
```

Takes the same query parameters (`organizationId`, `updatedSince`, `type`, `modelName`,
`publishedFrom`, `publishedTo`, `take`, `skip`) and
returns the same response shape as `GET /integration/publications`.

Errors: `400` for invalid query values. `401` when the token or the key is missing,
expired, unknown or revoked. `403` when the key lacks scope `media:read`.

### Original files (Phase 2)

Phase 1 has no endpoint for original files. Phase 2 adds
`POST /community/publications/{id}/original-link` with scope `original`; it requires
an order ID and returns a short-lived signed URL.

## Setup checklist

| Item | Owner |
|---|---|
| Keycloak client for Community in `eportal`, ID added to `KEYCLOAK_ALLOWED_CLIENTS` (for `POST /community/link` and `GET /integration/me/publications`) | AI Cave |
| API key with scope `media:read` issued at Admin → API Keys, sent over a secure channel | AI Cave |
| `COMMUNITY_PUBLIC_API_BASE_URL` set on core (origin of the media URLs) | AI Cave |
| Poll `GET /integration/publications` | Community |
| Call `GET /integration/me/publications` with the user's token for "my works" | Community |
