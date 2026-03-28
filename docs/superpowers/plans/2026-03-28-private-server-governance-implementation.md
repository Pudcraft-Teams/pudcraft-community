# Private Server Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild private-server membership, application, invite, sync, and admin workflows so they obey the finalized governance spec and expose one consistent state model to players and managers.

**Architecture:** Introduce a dedicated private-server governance domain layer with pure rule helpers plus Prisma-backed actor/sync services, then route all private-server API handlers through those helpers. Persist owner/member/sync state changes transactionally, keep player-facing membership payload normalized, and update the console/detail UI to consume the new contracts.

**Tech Stack:** Next.js App Router route handlers, React 19 client components, TypeScript 5 strict mode, Prisma 6 + PostgreSQL, Zod, Node built-in `node:test` runner via `tsx --test`

---

## File Map

**Create**

- `tests/private-servers/privateServerGovernance.test.ts`
- `tests/private-servers/privateServerPermissions.test.ts`
- `src/lib/private-server-governance.ts`
- `src/lib/private-server-governance-db.ts`
- `src/app/api/servers/[id]/applications/[appId]/cancel/route.ts`
- `prisma/migrations/20260328_private_server_governance/migration.sql`

**Modify**

- `package.json`
- `prisma/schema.prisma`
- `src/lib/types.ts`
- `src/lib/validation.ts`
- `src/lib/server-membership.ts`
- `src/app/api/servers/route.ts`
- `src/app/api/servers/[id]/settings/route.ts`
- `src/app/api/servers/[id]/verify/claim/route.ts`
- `src/app/api/servers/[id]/applications/route.ts`
- `src/app/api/servers/[id]/applications/[appId]/route.ts`
- `src/app/api/servers/[id]/join/[code]/route.ts`
- `src/app/api/servers/[id]/members/route.ts`
- `src/app/api/servers/[id]/members/[memberId]/route.ts`
- `src/app/api/servers/[id]/membership/route.ts`
- `src/app/api/servers/[id]/invites/route.ts`
- `src/app/api/servers/[id]/invites/[code]/route.ts`
- `src/app/api/servers/[id]/api-key/route.ts`
- `src/app/api/servers/[id]/sync/status/route.ts`
- `src/app/servers/[id]/page.tsx`
- `src/app/servers/[id]/apply/page.tsx`
- `src/app/servers/[id]/join/[code]/page.tsx`
- `src/app/console/[serverId]/page.tsx`
- `src/components/console/ApplicationList.tsx`
- `src/components/console/MemberList.tsx`
- `src/components/console/InviteManager.tsx`
- `docs/API.md`

---

### Task 1: Add Governance Contracts And Lightweight Test Harness

**Files:**
- Create: `tests/private-servers/privateServerGovernance.test.ts`
- Create: `tests/private-servers/privateServerPermissions.test.ts`
- Create: `src/lib/private-server-governance.ts`
- Modify: `package.json`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Write the failing governance contract tests**

```ts
// tests/private-servers/privateServerGovernance.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOwnerSyncArgs,
  normalizeMembershipView,
  type RawMembershipState,
} from "@/lib/private-server-governance";

test("normalizeMembershipView hides approved residual history", () => {
  const state: RawMembershipState = {
    isMember: false,
    role: null,
    membershipId: null,
    latestApplication: { id: "app_1", status: "approved", createdAt: "2026-03-28T00:00:00.000Z" },
  };

  const result = normalizeMembershipView(state);

  assert.equal(result.isMember, false);
  assert.equal(result.role, null);
  assert.equal(result.membershipId, null);
  assert.equal(result.latestApplication, null);
  assert.equal(result.hasResidualHistory, true);
});

test("buildOwnerSyncArgs requires mc username for private targets", () => {
  assert.throws(() => {
    buildOwnerSyncArgs({
      serverId: "srv_1",
      nextOwnerId: "user_1",
      targetVisibility: "private",
      ownerMcUsername: "",
    });
  }, /ownerMcUsername/i);
});
```

```ts
// tests/private-servers/privateServerPermissions.test.ts
import test from "node:test";
import assert from "node:assert/strict";

import { canManageMemberRole, canUseApiKeyPanel } from "@/lib/private-server-governance";

test("ADMIN cannot use API key panel", () => {
  assert.equal(canUseApiKeyPanel("ADMIN"), false);
  assert.equal(canUseApiKeyPanel("OWNER"), true);
});

test("OWNER can promote MEMBER to ADMIN but cannot change OWNER", () => {
  assert.equal(canManageMemberRole("OWNER", "MEMBER", "ADMIN"), true);
  assert.equal(canManageMemberRole("OWNER", "OWNER", "MEMBER"), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm exec tsx --test tests/private-servers/privateServerGovernance.test.ts tests/private-servers/privateServerPermissions.test.ts
```

Expected:

```text
ERR_MODULE_NOT_FOUND ... private-server-governance
```

- [ ] **Step 3: Add the pure governance module, test script, and contract types**

```ts
// src/lib/private-server-governance.ts
import type {
  ApplicationStatus,
  MembershipStatusView,
  ServerMemberRole,
  ServerVisibility,
} from "@/lib/types";

export interface RawMembershipState {
  isMember: boolean;
  role: ServerMemberRole | null;
  membershipId: string | null;
  latestApplication: {
    id: string;
    status: ApplicationStatus;
    createdAt: string;
  } | null;
}

export function normalizeMembershipView(state: RawMembershipState): MembershipStatusView {
  if (state.isMember) {
    return {
      isMember: true,
      role: state.role,
      membershipId: state.membershipId,
      latestApplication: null,
      hasResidualHistory: false,
      availableActions: {
        canApply: false,
        canJoinByInvite: false,
        canCancelApplication: false,
        canLeave: state.role !== "OWNER",
      },
    };
  }

  const isResidualHistory = state.latestApplication?.status === "approved";
  return {
    isMember: false,
    role: null,
    membershipId: null,
    latestApplication: isResidualHistory ? null : state.latestApplication,
    hasResidualHistory: isResidualHistory,
    availableActions: {
      canApply: true,
      canJoinByInvite: true,
      canCancelApplication: state.latestApplication?.status === "pending",
      canLeave: false,
    },
  };
}

export function buildOwnerSyncArgs(input: {
  serverId: string;
  nextOwnerId: string;
  targetVisibility: ServerVisibility;
  ownerMcUsername?: string;
}) {
  if (input.targetVisibility !== "public" && !input.ownerMcUsername?.trim()) {
    throw new Error("ownerMcUsername is required for private targets");
  }
  return input;
}

export function canUseApiKeyPanel(role: ServerMemberRole | null): boolean {
  return role === "OWNER";
}

export function canManageMemberRole(
  actorRole: ServerMemberRole | null,
  targetRole: ServerMemberRole,
  nextRole: "ADMIN" | "MEMBER",
): boolean {
  return actorRole === "OWNER" && targetRole !== "OWNER" && targetRole !== nextRole;
}
```

```ts
// src/lib/types.ts
export type ServerMemberRole = "OWNER" | "ADMIN" | "MEMBER";

export interface MembershipStatusView {
  isMember: boolean;
  role: ServerMemberRole | null;
  membershipId: string | null;
  latestApplication: {
    id: string;
    status: "pending" | "rejected" | "cancelled";
    createdAt: string;
  } | null;
  hasResidualHistory: boolean;
  availableActions: {
    canApply: boolean;
    canJoinByInvite: boolean;
    canCancelApplication: boolean;
    canLeave: boolean;
  };
}
```

```json
// package.json
{
  "scripts": {
    "test": "tsx --test tests/**/*.test.ts"
  }
}
```

- [ ] **Step 4: Run tests to verify the contracts pass**

Run:

```bash
pnpm exec tsx --test tests/private-servers/privateServerGovernance.test.ts tests/private-servers/privateServerPermissions.test.ts
```

Expected:

```text
ok 1 - normalizeMembershipView hides approved residual history
ok 2 - buildOwnerSyncArgs requires mc username for private targets
ok 3 - ADMIN cannot use API key panel
ok 4 - OWNER can promote MEMBER to ADMIN but cannot change OWNER
```

- [ ] **Step 5: Commit**

```bash
git add package.json tests/private-servers/privateServerGovernance.test.ts tests/private-servers/privateServerPermissions.test.ts src/lib/private-server-governance.ts src/lib/types.ts src/lib/validation.ts
git commit -m "feat: add private server governance contracts"
```

### Task 2: Extend Prisma Schema And Migration For Governance State

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260328_private_server_governance/migration.sql`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/validation.ts`

- [ ] **Step 1: Add schema fields and enum-like string surfaces**

```prisma
model ServerMember {
  id         String   @id @default(cuid())
  serverId   String   @map("server_id")
  userId     String   @map("user_id")
  role       String   @default("MEMBER") @map("role") // OWNER | ADMIN | MEMBER
  joinedVia  String   @map("joined_via") // claim | apply | invite
  mcUsername String?  @map("mc_username")
  createdAt  DateTime @default(now()) @map("created_at")

  server Server          @relation(fields: [serverId], references: [id], onDelete: Cascade)
  user   User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  syncs  WhitelistSync[]

  @@unique([serverId, userId], name: "unique_server_member")
  @@index([serverId, role])
  @@map("server_members")
}

model WhitelistSync {
  id                 String    @id @default(cuid())
  serverId           String    @map("server_id")
  memberId           String?   @map("member_id")
  targetUserId       String    @map("target_user_id")
  mcUsernameSnapshot String?   @map("mc_username_snapshot")
  targetRoleSnapshot String?   @map("target_role_snapshot")
  source             String    @map("source")
  action             String
  status             String    @default("pending")
  retryCount         Int       @default(0) @map("retry_count")
  lastAttemptAt      DateTime? @map("last_attempt_at")
  ackedAt            DateTime? @map("acked_at")
  createdAt          DateTime  @default(now()) @map("created_at")

  server Server        @relation(fields: [serverId], references: [id], onDelete: Cascade)
  member ServerMember? @relation(fields: [memberId], references: [id], onDelete: SetNull)
}
```

- [ ] **Step 2: Write the SQL migration with partial indexes and backfill**

```sql
ALTER TABLE "server_members" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'MEMBER';
ALTER TABLE "whitelist_syncs" ADD COLUMN "target_user_id" TEXT;
ALTER TABLE "whitelist_syncs" ADD COLUMN "mc_username_snapshot" TEXT;
ALTER TABLE "whitelist_syncs" ADD COLUMN "target_role_snapshot" TEXT;
ALTER TABLE "whitelist_syncs" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'apply_approve';
ALTER TABLE "whitelist_syncs" ALTER COLUMN "member_id" DROP NOT NULL;

DROP INDEX IF EXISTS "server_applications_unique_server_application_key";
CREATE UNIQUE INDEX server_applications_one_pending_per_user_idx
ON "server_applications" ("server_id", "user_id")
WHERE status = 'pending';

CREATE UNIQUE INDEX server_members_one_owner_per_server_idx
ON "server_members" ("server_id")
WHERE role = 'OWNER';

UPDATE "server_members"
SET "role" = 'OWNER', "joined_via" = 'claim'
FROM "servers"
WHERE "server_members"."server_id" = "servers"."id"
  AND "server_members"."user_id" = "servers"."owner_id"
  AND "servers"."visibility" <> 'public';
```

- [ ] **Step 3: Add the new type/validation surfaces used by routes and UI**

```ts
// src/lib/validation.ts
export const serverMemberRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);

export const updateServerMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const membershipStatusViewSchema = z.object({
  isMember: z.boolean(),
  role: serverMemberRoleSchema.nullable(),
  membershipId: z.string().cuid().nullable(),
  latestApplication: z
    .object({
      id: z.string().cuid(),
      status: z.enum(["pending", "rejected", "cancelled"]),
      createdAt: z.string(),
    })
    .nullable(),
  hasResidualHistory: z.boolean().default(false),
});
```

- [ ] **Step 4: Verify Prisma and TypeScript surfaces**

Run:

```bash
pnpm exec prisma validate
pnpm db:generate
pnpm exec tsc --noEmit
```

Expected:

```text
The schema at prisma/schema.prisma is valid
Generated Prisma Client
Found 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260328_private_server_governance/migration.sql src/lib/types.ts src/lib/validation.ts
git commit -m "feat: add private server governance schema"
```

### Task 3: Add Prisma-Backed Actor Context, Owner Sync, And Whitelist Snapshot Helpers

**Files:**
- Create: `src/lib/private-server-governance-db.ts`
- Modify: `tests/private-servers/privateServerPermissions.test.ts`
- Modify: `src/app/api/servers/route.ts`
- Modify: `src/app/api/servers/[id]/settings/route.ts`
- Modify: `src/app/api/servers/[id]/verify/claim/route.ts`

- [ ] **Step 1: Extend the permission test with owner sync argument branches**

```ts
test("buildOwnerSyncArgs allows public targets without mc username", () => {
  const args = buildOwnerSyncArgs({
    serverId: "srv_1",
    nextOwnerId: "user_1",
    targetVisibility: "public",
  });

  assert.equal(args.targetVisibility, "public");
});
```

- [ ] **Step 2: Run the permission test to verify the new case fails**

Run:

```bash
pnpm exec tsx --test tests/private-servers/privateServerPermissions.test.ts
```

Expected:

```text
AssertionError or branch mismatch for public target handling
```

- [ ] **Step 3: Implement the DB governance service and wire owner-sync entry points**

```ts
// src/lib/private-server-governance-db.ts
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function getServerActorContext(serverId: string, userId: string) {
  const [server, membership] = await Promise.all([
    prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, ownerId: true, visibility: true },
    }),
    prisma.serverMember.findUnique({
      where: { unique_server_member: { serverId, userId } },
      select: { id: true, role: true, mcUsername: true },
    }),
  ]);

  return {
    server,
    membershipId: membership?.id ?? null,
    role: (membership?.role as "OWNER" | "ADMIN" | "MEMBER" | undefined) ?? null,
    mcUsername: membership?.mcUsername ?? null,
  };
}

export async function syncServerOwnerMembership(
  tx: Prisma.TransactionClient,
  args:
    | { serverId: string; nextOwnerId: string; targetVisibility: "public" }
    | {
        serverId: string;
        nextOwnerId: string;
        targetVisibility: "private" | "unlisted";
        ownerMcUsername: string;
      },
) {
  if (args.targetVisibility === "public") {
    return;
  }

  const existingOwner = await tx.serverMember.findFirst({
    where: { serverId: args.serverId, role: "OWNER" },
    select: { id: true, userId: true },
  });

  if (existingOwner && existingOwner.userId !== args.nextOwnerId) {
    await tx.serverMember.update({
      where: { id: existingOwner.id },
      data: { role: "MEMBER" },
    });
  }

  const nextMembership = await tx.serverMember.findUnique({
    where: { unique_server_member: { serverId: args.serverId, userId: args.nextOwnerId } },
    select: { id: true },
  });

  if (nextMembership) {
    await tx.serverMember.update({
      where: { id: nextMembership.id },
      data: { role: "OWNER", joinedVia: "claim" },
    });
    return;
  }

  await tx.serverMember.create({
    data: {
      serverId: args.serverId,
      userId: args.nextOwnerId,
      role: "OWNER",
      joinedVia: "claim",
      mcUsername: args.ownerMcUsername,
    },
  });
}
```

```ts
// src/app/api/servers/[id]/settings/route.ts
const nextVisibility = visibility ?? existing.visibility;
await prisma.$transaction(async (tx) => {
  await tx.server.update({ where: { id: existing.id }, data: updateData });
  if (existing.visibility === "public" && nextVisibility !== "public") {
    await syncServerOwnerMembership(tx, {
      serverId: existing.id,
      nextOwnerId: existing.ownerId!,
      targetVisibility: nextVisibility,
      ownerMcUsername: ownerMcUsernameFromRequest,
    });
  }
});
```

```ts
// src/app/api/servers/[id]/verify/claim/route.ts
await prisma.$transaction(async (tx) => {
  await tx.server.update({
    where: { id: cuid },
    data: {
      isVerified: true,
      verifiedAt: new Date(),
      ownerId: server.verifyUserId,
      verifyToken: null,
      verifyExpiresAt: null,
      verifyUserId: null,
    },
  });

  await syncServerOwnerMembership(tx, {
    serverId: cuid,
    nextOwnerId: server.verifyUserId!,
    targetVisibility: server.visibility === "public" ? "public" : server.visibility,
    ownerMcUsername: claimedMcUsername,
  });
});
```

- [ ] **Step 4: Verify the tests and route compile surface**

Run:

```bash
pnpm exec tsx --test tests/private-servers/privateServerGovernance.test.ts tests/private-servers/privateServerPermissions.test.ts
pnpm exec tsc --noEmit
```

Expected:

```text
All tests passed
Found 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/private-server-governance-db.ts src/app/api/servers/route.ts src/app/api/servers/[id]/settings/route.ts src/app/api/servers/[id]/verify/claim/route.ts tests/private-servers/privateServerPermissions.test.ts
git commit -m "feat: add private server actor and owner sync services"
```

### Task 4: Refactor Player-Facing Membership, Application, Invite, And Leave Flows

**Files:**
- Modify: `src/app/api/servers/[id]/membership/route.ts`
- Modify: `src/app/api/servers/[id]/applications/route.ts`
- Create: `src/app/api/servers/[id]/applications/[appId]/cancel/route.ts`
- Modify: `src/app/api/servers/[id]/applications/[appId]/route.ts`
- Modify: `src/app/api/servers/[id]/join/[code]/route.ts`
- Modify: `src/lib/private-server-governance-db.ts`

- [ ] **Step 1: Write the failing player-flow contract tests**

```ts
// tests/private-servers/privateServerGovernance.test.ts
test("member view clears latestApplication and enables leave for ADMIN", () => {
  const result = normalizeMembershipView({
    isMember: true,
    role: "ADMIN",
    membershipId: "mem_1",
    latestApplication: null,
  });

  assert.equal(result.availableActions.canLeave, true);
  assert.equal(result.latestApplication, null);
});
```

- [ ] **Step 2: Run tests to verify the new player-flow contract fails**

Run:

```bash
pnpm exec tsx --test tests/private-servers/privateServerGovernance.test.ts
```

Expected:

```text
AssertionError for canLeave or normalized member payload
```

- [ ] **Step 3: Implement normalized membership responses and transactional player actions**

```ts
// src/app/api/servers/[id]/membership/route.ts
const [member, latestApplication] = await Promise.all([
  prisma.serverMember.findUnique({
    where: { unique_server_member: { serverId, userId } },
    select: { id: true, role: true },
  }),
  prisma.serverApplication.findFirst({
    where: { serverId, userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, status: true, createdAt: true },
  }),
]);

return NextResponse.json(
  normalizeMembershipView({
    isMember: !!member,
    role: (member?.role as "OWNER" | "ADMIN" | "MEMBER" | undefined) ?? null,
    membershipId: member?.id ?? null,
    latestApplication: latestApplication
      ? {
          id: latestApplication.id,
          status: latestApplication.status as "pending" | "approved" | "rejected" | "cancelled",
          createdAt: latestApplication.createdAt.toISOString(),
        }
      : null,
  }),
);
```

```ts
// src/app/api/servers/[id]/applications/[appId]/cancel/route.ts
const updated = await prisma.serverApplication.updateMany({
  where: { id: appId, serverId, userId, status: "pending" },
  data: { status: "cancelled", reviewNote: "用户主动撤回申请" },
});
```

```ts
// src/app/api/servers/[id]/join/[code]/route.ts
if (server.joinMode !== "invite" && server.joinMode !== "apply_and_invite") {
  return NextResponse.json({ error: "当前加入模式不支持邀请码" }, { status: 400 });
}

await tx.serverApplication.updateMany({
  where: { serverId: server.id, userId, status: "pending" },
  data: {
    status: "cancelled",
    reviewNote: "已通过邀请码加入自动关闭",
  },
});
```

```ts
// src/app/api/servers/[id]/membership/route.ts
const member = await tx.serverMember.findUnique({
  where: { unique_server_member: { serverId, userId } },
  select: { id: true, role: true, mcUsername: true },
});

if (!member || member.role === "OWNER") {
  return NextResponse.json({ error: "当前成员状态不允许退服" }, { status: 400 });
}

const sync = await createWhitelistSyncRecord(tx, {
  serverId,
  memberId: member.id,
  targetUserId: userId,
  mcUsername: member.mcUsername,
  targetRole: member.role,
  action: "remove",
  source: "self_leave",
});
await tx.serverMember.delete({ where: { id: member.id } });
```

- [ ] **Step 4: Verify the player-flow tests and typecheck**

Run:

```bash
pnpm exec tsx --test tests/private-servers/privateServerGovernance.test.ts tests/private-servers/privateServerPermissions.test.ts
pnpm exec tsc --noEmit
```

Expected:

```text
All tests passed
Found 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/servers/[id]/membership/route.ts src/app/api/servers/[id]/applications/route.ts src/app/api/servers/[id]/applications/[appId]/cancel/route.ts src/app/api/servers/[id]/applications/[appId]/route.ts src/app/api/servers/[id]/join/[code]/route.ts src/lib/private-server-governance-db.ts tests/private-servers/privateServerGovernance.test.ts
git commit -m "feat: normalize private server player flows"
```

### Task 5: Refactor Manager APIs For Role-Based Private Governance

**Files:**
- Modify: `src/app/api/servers/[id]/members/route.ts`
- Modify: `src/app/api/servers/[id]/members/[memberId]/route.ts`
- Modify: `src/app/api/servers/[id]/invites/route.ts`
- Modify: `src/app/api/servers/[id]/invites/[code]/route.ts`
- Modify: `src/app/api/servers/[id]/applications/[appId]/route.ts`
- Modify: `src/app/api/servers/[id]/api-key/route.ts`
- Modify: `src/app/api/servers/[id]/sync/status/route.ts`
- Modify: `src/lib/private-server-governance-db.ts`

- [ ] **Step 1: Write the failing permission-matrix tests**

```ts
// tests/private-servers/privateServerPermissions.test.ts
test("ADMIN cannot remove another ADMIN", () => {
  assert.equal(canRemoveMember("ADMIN", "ADMIN"), false);
  assert.equal(canRemoveMember("ADMIN", "MEMBER"), true);
});
```

- [ ] **Step 2: Run tests to verify the new matrix fails**

Run:

```bash
pnpm exec tsx --test tests/private-servers/privateServerPermissions.test.ts
```

Expected:

```text
AssertionError for canRemoveMember matrix
```

- [ ] **Step 3: Implement role-based guards and snapshot-backed member sync status**

```ts
// src/lib/private-server-governance.ts
export function canRemoveMember(
  actorRole: "OWNER" | "ADMIN" | null,
  targetRole: "OWNER" | "ADMIN" | "MEMBER",
): boolean {
  if (actorRole === "OWNER") return targetRole !== "OWNER";
  if (actorRole === "ADMIN") return targetRole === "MEMBER";
  return false;
}
```

```ts
// src/app/api/servers/[id]/members/route.ts
const actor = await requireServerRole(serverId, userId, ["OWNER", "ADMIN"]);

const members = await prisma.serverMember.findMany({
  where: { serverId, ...(role !== "all" ? { role } : {}) },
  orderBy: [{ role: "asc" }, { createdAt: "desc" }],
  include: {
    user: { select: { id: true, name: true, image: true } },
  },
});
```

```ts
// src/app/api/servers/[id]/members/[memberId]/route.ts
if (!canRemoveMember(actor.role, target.role as "OWNER" | "ADMIN" | "MEMBER")) {
  return NextResponse.json({ error: "无权限移除此成员" }, { status: 403 });
}
```

```ts
// src/app/api/servers/[id]/api-key/route.ts
await requireServerRole(server.id, userId, ["OWNER"]);
```

- [ ] **Step 4: Verify the manager matrix tests and route typecheck**

Run:

```bash
pnpm exec tsx --test tests/private-servers/privateServerPermissions.test.ts
pnpm exec tsc --noEmit
```

Expected:

```text
All tests passed
Found 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/servers/[id]/members/route.ts src/app/api/servers/[id]/members/[memberId]/route.ts src/app/api/servers/[id]/invites/route.ts src/app/api/servers/[id]/invites/[code]/route.ts src/app/api/servers/[id]/applications/[appId]/route.ts src/app/api/servers/[id]/api-key/route.ts src/app/api/servers/[id]/sync/status/route.ts src/lib/private-server-governance.ts src/lib/private-server-governance-db.ts tests/private-servers/privateServerPermissions.test.ts
git commit -m "feat: add private server role-based manager APIs"
```

### Task 6: Update Detail, Apply, Join, And Console UI To The New Contracts

**Files:**
- Modify: `src/app/servers/[id]/page.tsx`
- Modify: `src/app/servers/[id]/apply/page.tsx`
- Modify: `src/app/servers/[id]/join/[code]/page.tsx`
- Modify: `src/app/console/[serverId]/page.tsx`
- Modify: `src/components/console/ApplicationList.tsx`
- Modify: `src/components/console/MemberList.tsx`
- Modify: `src/components/console/InviteManager.tsx`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Dispatch the UI task to a worker with the design skill**

Use a worker subagent for the UI slice only. Tell it to load `frontend-design` first, then preserve the existing Warm Clay system while updating information hierarchy.

```text
Worker scope:
- src/app/servers/[id]/page.tsx
- src/app/servers/[id]/apply/page.tsx
- src/app/servers/[id]/join/[code]/page.tsx
- src/app/console/[serverId]/page.tsx
- src/components/console/ApplicationList.tsx
- src/components/console/MemberList.tsx
- src/components/console/InviteManager.tsx
```

- [ ] **Step 2: Update player pages to consume `MembershipStatusView`**

```tsx
// src/app/servers/[id]/apply/page.tsx
if (membership?.isMember) {
  return <MemberStateCard role={membership.role} serverDetailUrl={serverDetailUrl} />;
}

if (membership?.availableActions.canCancelApplication && membership.latestApplication) {
  return (
    <PendingApplicationCard
      applicationId={membership.latestApplication.id}
      serverId={id}
      serverDetailUrl={serverDetailUrl}
    />
  );
}
```

```tsx
// src/app/servers/[id]/join/[code]/page.tsx
{membership?.isMember ? (
  <AlreadyJoinedCard role={membership.role} targetUrl={targetUrl} />
) : membership?.latestApplication?.status === "pending" ? (
  <p className="text-sm text-warm-500">通过邀请码加入后，当前申请会自动关闭。</p>
) : null}
```

- [ ] **Step 3: Update console components for role badges and cancelled applications**

```tsx
// src/components/console/MemberList.tsx
const ROLE_STYLES = {
  OWNER: "bg-warm-100 text-warm-800",
  ADMIN: "bg-accent-muted text-accent-hover",
  MEMBER: "bg-warm-50 text-warm-500",
} as const;

{member.role && (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_STYLES[member.role]}`}>
    {member.role}
  </span>
)}
```

```tsx
// src/components/console/ApplicationList.tsx
const TABS = [
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已拒绝" },
  { key: "cancelled", label: "已撤回" },
] as const;
```

- [ ] **Step 4: Verify the UI slice**

Run:

```bash
pnpm lint
pnpm exec tsc --noEmit
```

Expected:

```text
No ESLint warnings or errors
Found 0 errors
```

- [ ] **Step 5: Commit**

```bash
git add src/app/servers/[id]/page.tsx src/app/servers/[id]/apply/page.tsx src/app/servers/[id]/join/[code]/page.tsx src/app/console/[serverId]/page.tsx src/components/console/ApplicationList.tsx src/components/console/MemberList.tsx src/components/console/InviteManager.tsx src/lib/types.ts
git commit -m "feat: update private server governance UI"
```

### Task 7: Update API Docs And Run Final Verification

**Files:**
- Modify: `docs/API.md`
- Modify: `docs/superpowers/specs/2026-03-28-private-server-workflow-governance-design.md` only if final plan uncovered a spec typo

- [ ] **Step 1: Update API documentation to match the new routes and payloads**

```md
### 当前成员状态
GET /api/servers/:id/membership

{
  "isMember": false,
  "role": null,
  "membershipId": null,
  "latestApplication": null,
  "hasResidualHistory": true,
  "availableActions": {
    "canApply": true,
    "canJoinByInvite": true,
    "canCancelApplication": false,
    "canLeave": false
  }
}

### 取消申请
POST /api/servers/:id/applications/:appId/cancel

### 主动退服
DELETE /api/servers/:id/membership
```

- [ ] **Step 2: Run the complete verification suite**

Run:

```bash
pnpm exec tsx --test tests/private-servers/*.test.ts
pnpm exec prisma validate
pnpm db:generate
pnpm lint
pnpm exec tsc --noEmit
```

Expected:

```text
All private-server tests passed
The schema at prisma/schema.prisma is valid
Generated Prisma Client
No ESLint warnings or errors
Found 0 errors
```

- [ ] **Step 3: Inspect git diff for scope control**

Run:

```bash
git diff --stat
git diff -- src/app/api/servers src/app/servers/[id] src/components/console src/lib prisma docs/API.md
```

Expected:

```text
Only private-server governance files changed
```

- [ ] **Step 4: Commit the docs and verification pass**

```bash
git add docs/API.md
git commit -m "docs: update private server governance API docs"
```

## Self-Review

### Spec Coverage

- Member role model, partial unique owner constraint, and owner sync triggers are covered by Tasks 1-3.
- Player-facing normalized membership payload, residual history handling, cancel application, invite auto-cancel, and leave flow are covered by Task 4.
- Owner/admin permission matrix, member role patching, API key owner-only enforcement, and sync-status access are covered by Task 5.
- Detail/apply/join/console UI changes plus the subagent + design-skill requirement are covered by Task 6.
- API documentation and final verification are covered by Task 7.

### Placeholder Scan

- No `TODO` / `TBD` placeholders remain.
- Every route or helper introduced in the spec appears in at least one task.
- Commands are concrete and use tools already present in the repo (`tsx`, `prisma`, `tsc`, `eslint`).

### Type Consistency

- `ServerMemberRole` is used consistently as `OWNER | ADMIN | MEMBER`.
- Player-facing `MembershipStatusView` keeps `role` and `membershipId` nullable when `isMember = false`.
- Owner sync args use the explicit `targetVisibility` discriminated union from spec.
