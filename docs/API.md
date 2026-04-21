# Pudcraft Community API Reference

> Branch: server-only
> Base path: `/api`

This document describes only the live server-only endpoints. Forum / MoltBook endpoints from earlier branches have been removed and are no longer part of the live API surface.

## Conventions

### Authentication

- Web: session cookie (Auth.js / NextAuth)
- Plugin / sync / plugin claim: bearer API key or claim key
- Mobile: trusted session cookie returned by `/api/mobile/session*`

### Response format

Successful responses typically use one of:

```json
{ "data": {} }
```

```json
{ "success": true }
```

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error responses are uniformly:

```json
{
  "error": "error description",
  "details": {}
}
```

`details` is optional; most business errors return `{ error }` alone, and only attach `details` for validation failures or when extra context is needed.

### Common status codes

- `200`: success
- `201`: created
- `400`: bad request / validation failure
- `401`: not authenticated
- `403`: forbidden or account unavailable
- `404`: not found
- `409`: conflict / duplicate submission
- `429`: rate limited
- `500`: internal server error

### Server identifiers

Some endpoints accept either of two identifiers:

- The database `cuid`
- The public-facing `PSID`

In this document both are written as `{id}`.

### Response localization

- API error responses (`{ error, details }`) honor the caller's locale. Resolution order: `x-locale` header → `NEXT_LOCALE` cookie → `Accept-Language` → `zh` default.
- Zod validation failures returned as `details.fieldErrors` are already localized per field — the server translates the `errors.validation.<area>.<key>` paths before serialization.
- Email subjects / bodies (`sendVerificationCode`, `sendResetPasswordCode`) resolve the recipient's locale from `User.locale`, with an explicit `localeOverride` honored first (unauthenticated flows pass the request locale so the response and the email match).
- Successful response bodies may still contain locale-specific strings (server-name, comment body, user-provided content). Clients should not depend on any non-machine-readable value being English.
- New client code should use `apiFetch` from `@/lib/apiFetch` to inject `x-locale` explicitly.

## Authentication endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET / POST | `/auth/[...nextauth]` | - | Standard Auth.js routes |
| POST | `/auth/register` | - | Email registration |
| POST | `/auth/send-code` | - | Send email verification code |
| POST / PATCH | `/auth/reset-password` | - | Send reset code / reset password with code |

## Public and user endpoints

### Server discovery and detail

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/servers` | Optional | Server list; supports `page`, `limit/pageSize`, `tag`, `search`, `sort`, `ownerId` |
| POST | `/servers` | Signed in | Submit a server; accepts multipart/form-data and icon upload |
| GET | `/servers/{id}` | Optional | Server detail; unapproved or non-public servers are filtered by permission |
| PATCH | `/servers/{id}` | Owner | Edit server info |
| DELETE | `/servers/{id}` | Owner / admin | Delete server |
| GET | `/servers/{id}/ping` | Optional | Lightweight latency probe; does not hit the database — validates the server ID format and returns immediately |
| GET | `/servers/{id}/stats` | Owner | Server statistics; supports `period=24h|7d|30d` |
| POST | `/servers/{id}/status/report` | Plugin API key | Plugin-reported online status |

### Favorites and comments

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/servers/{id}/favorite` | Signed in | Current user's favorite state for the server |
| POST | `/servers/{id}/favorite` | Signed in | Favorite a server |
| DELETE | `/servers/{id}/favorite` | Signed in | Unfavorite |
| GET | `/user/favorites` | Signed in | Current user's favorited servers |
| GET | `/user/favorites/ids` | Signed in | IDs of the current user's favorited servers |
| GET | `/servers/{id}/comments` | Optional | Comments |
| POST | `/servers/{id}/comments` | Signed in | Post a comment or reply |
| DELETE | `/servers/{id}/comments/{commentId}` | Author / admin | Delete a comment |

### User profile, notifications, reports

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/user/{id}` | Optional | Public user profile and their public servers |
| GET | `/user/profile` | Signed in | Current user's profile |
| PATCH | `/user/profile` | Signed in | Update current user's profile |
| GET | `/notifications` | Signed in | Notifications list; supports pagination and `unreadOnly` |
| PATCH | `/notifications` | Signed in | Bulk mark as read |
| GET | `/notifications/unread-count` | Signed in | Unread notification count |
| POST | `/reports` | Signed in | Report a server, comment, or user |
| GET | `/changelog` | Optional | Public changelog |
| GET | `/health` | - | Health check |
| POST | `/uploads/editor-image` | Signed in | Editor image upload |

## Server claiming and owner-management endpoints

### Claim flow

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/servers/{id}/verify` | Signed in | Claim state from the current user's perspective; only the current claim initiator can see `verifyToken` |
| POST | `/servers/{id}/verify` | Signed in | Start a MOTD-token claim; any signed-in user may initiate, ownership may transfer on success |
| PATCH | `/servers/{id}/verify` | Signed in (current claim initiator) | Trigger the BullMQ verify job and await the result |
| POST | `/servers/{id}/verify/claim` | Bearer claim key / API key | Plugin-side claim completion or API-key validation for an already-claimed server |
| GET | `/servers/{id}/verify/claim-key` | Signed in | Claim-key state for the current user |
| POST | `/servers/{id}/verify/claim-key` | Signed in | Generate a claim key for an unclaimed server; current owner or a valid claim initiator may do this |

### Private-server settings, applications, invites, members

> Note: these endpoints are gated by `NEXT_PUBLIC_ENABLE_PRIVATE_SERVERS`. When disabled they all return `404`, and the UI must not expose application, invite-code, or member-management entry points.

| Method | Path | Auth | Notes |
|---|---|---|---|
| PUT | `/servers/{id}/settings` | Owner | Update visibility, join mode, application form, etc. |
| GET | `/servers/{id}/membership` | Signed in | Current user's member / application state |
| GET | `/servers/{id}/applications` | Owner | Application list |
| POST | `/servers/{id}/applications` | Signed in | Submit a join application |
| PUT | `/servers/{id}/applications/{appId}` | Owner | Review an application |
| GET | `/servers/{id}/invites` | Owner | Invite codes |
| POST | `/servers/{id}/invites` | Owner | Create an invite code |
| DELETE | `/servers/{id}/invites/{code}` | Owner | Revoke an invite code |
| POST | `/servers/{id}/join/{code}` | Signed in | Join via invite code |
| GET | `/servers/{id}/members` | Owner | Member list |
| DELETE | `/servers/{id}/members/{memberId}` | Owner | Remove a member |
| POST | `/servers/{id}/api-key` | Owner | Generate or reset the plugin API key |

### Modpacks

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/servers/{id}/modpack` | Optional | Modpack list for a server; unapproved servers are visible only to owner / admin, private servers still require membership |
| POST | `/servers/{id}/modpack` | Owner | Upload a modpack |
| DELETE | `/modpacks/{modpackId}` | Owner | Delete a modpack |
| GET | `/modpacks/{modpackId}/download` | Optional | Download a modpack; unapproved servers are downloadable only by owner / admin, private servers still require membership |

## Whitelist-sync and mobile endpoints

### Whitelist sync

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/servers/{id}/sync/handshake` | Plugin API key | Initial sync handshake; returns whitelist and WS info |
| GET | `/servers/{id}/sync/pending` | Plugin API key | Pending / failed sync items |
| GET | `/servers/{id}/sync/status` | Owner | Sync overview for the console |
| POST | `/sync/{syncId}/ack` | Plugin API key | Acknowledge a processed sync event |

### Native mobile endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/mobile/session` | Mobile session | Current mobile session |
| DELETE | `/mobile/session` | Mobile session | Log out the mobile session |
| POST | `/mobile/session/login` | - | Mobile login |
| GET | `/mobile/inbox` | Mobile session | Aggregated mobile inbox |
| POST | `/mobile/inbox/read` | Mobile session | Mark mobile inbox items as read |
| GET | `/mobile/inbox/unread-summary` | Mobile session | Mobile unread summary |

## Admin endpoints

### Servers / users / moderation / reports / changelog

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/servers` | Admin | Admin server list |
| PATCH | `/admin/servers/{id}` | Admin | Review / update server status |
| DELETE | `/admin/servers/{id}` | Admin | Delete a server |
| GET | `/admin/users` | Admin | User list |
| PATCH | `/admin/users/{id}` | Admin | Ban, unban, role changes, etc. |
| GET | `/admin/moderation` | Admin | Moderation logs |
| PATCH | `/admin/moderation/{id}` | Admin | Resolve a moderation record |
| GET | `/admin/reports` | Admin | Report list |
| PATCH | `/admin/reports/{id}` | Admin | Resolve a report |
| GET | `/admin/changelog` | Admin | Changelog list |
| POST | `/admin/changelog` | Admin | Create a changelog entry |
| PATCH | `/admin/changelog/{id}` | Admin | Edit a changelog entry |
| DELETE | `/admin/changelog/{id}` | Admin | Delete a changelog entry |

## Live constraints

- Search, discovery, favorites, notifications, reports, and the console are all centered on the server system.
- Forum / circles / posts / tags / bookmarks / forum-notification endpoints are no longer on this branch; any remaining external caller needs a compatibility layer or migration plan — do not re-add the old descriptions to this document.
- If code and docs disagree, `src/app/api/**/route.ts` wins; sync this file to match immediately.
