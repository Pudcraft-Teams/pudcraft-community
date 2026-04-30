# Dependency pins

Checked on 2026-04-19 against `package.json`, `npm view`, and the upstream migration docs linked from the package maintainers.

This branch keeps the live Next/React stack current and only documents pins that still have an active migration cost. If a package is merely behind latest but no longer has a confirmed blocker, do not treat it as a policy pin.

## Intentionally pinned below latest

- `@prisma/client` / `prisma` stay on `6.19.2` while latest is `7.7.0`.
  - Upstream evidence: Prisma 7 is ESM-only and moves more CLI/database config into `prisma.config.ts`.
  - Local evidence: this repo still uses `generator client { provider = "prisma-client-js" }` in `prisma/schema.prisma`, runs plain `prisma ...` scripts from `package.json`, and does not mark the package as `"type": "module"`.
  - Why pinned: this is a coordinated ORM/runtime migration, not a safe drive-by version bump.

- `tailwindcss` stays on `3.4.19` while latest is `4.2.2`.
  - Upstream evidence: Tailwind 4 replaces the old PostCSS wiring and `@tailwind` directives with `@tailwindcss/postcss` and `@import "tailwindcss"`.
  - Local evidence: the repo still uses `tailwind.config.ts`, `postcss.config.mjs` with the `tailwindcss` plugin, and `src/styles/globals.css` with `@tailwind base;`, `@tailwind components;`, and `@tailwind utilities;`.
  - Why pinned: the current Warm Clay theme is still on the v3 config pipeline.

- `typescript` stays on `5.9.3` while latest is `6.0.3`.
  - Upstream evidence: TypeScript 6 changes compiler defaults such as `rootDir` inference.
  - Local evidence: `tsconfig.json` currently relies on inferred roots while spanning `src`, `prisma`, `scripts`, and `.next/types`.
  - Why pinned: upgrade only with a full repo-wide `pnpm tsc --noEmit` pass plus script/tooling verification.

- `zod` stays on `3.25.76` while latest is `4.3.6`.
  - Upstream evidence: after `zod@4`, the package root (`"zod"`) exports Zod 4, and code that wants Zod 3 semantics must move to `zod/v3`.
  - Local evidence: the codebase imports from `"zod"` broadly, and still contains Zod 3-era access patterns such as `parsed.error.errors[0]` in `src/app/api/reports/route.ts`.
  - Why pinned: bumping requires an explicit repo-wide compatibility pass, not a silent major update.

- `cropperjs` stays on `1.6.2` while latest is `2.1.1`.
  - Upstream evidence: Cropper 2 replaces much of the v1 option/event API with new custom-element primitives.
  - Local evidence: the current crop flow uses `react-cropper`, `cropperjs/dist/cropper.css`, and v1-style `Cropper` instance types in `src/components/ImageCropDialog.tsx` and `src/app/layout.tsx`.
  - Why pinned: moving to v2 is a UI integration rewrite, not a routine dependency bump.

- `eslint` stays on `9.39.2` while latest is `10.2.1`.
  - Upstream evidence: the current Next 16 lint stack still pulls plugins whose peer ranges stop at ESLint 9.
  - Local evidence: upgrading to `eslint@10.2.1` made `pnpm lint` fail at runtime with `TypeError: contextOrFilename.getFilename is not a function` while loading `eslint-plugin-react` through `eslint-config-next`.
  - Why pinned: ESLint 10 is not yet a working lint baseline for this repo, even though other validation passes.

## Deprecated-but-retained packages

- `minecraft-server-util`
  - Still used by `src/lib/mc-ping.ts` for ping/verification. Replace it only as a dedicated transport/runtime task.

- `@types/cropperjs`
  - Deprecated because `cropperjs` now ships its own types.
  - Keep it only until the cropper integration is updated and revalidated.

## Policy

For routine dependency maintenance on this branch:

1. Keep `next`, `react`, `react-dom`, `eslint-config-next`, and compatible direct dependencies current.
2. Leave the packages above pinned until their named migration work is actually scheduled.
3. If a pin is lifted, update this file in the same change with the migration note removed.
