export const dynamic = "force-dynamic";

import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import {
  computeFormContentHash,
  normalizeApplicationFormDocument,
  readEmbeddedEvaluation,
  stripInternalFormDataKeys,
} from "@/lib/applicationFormDocument";
import {
  computeVisibleFields,
  evaluateApplication,
  findMissingRequiredFields,
  pickPlayerEvaluationView,
} from "@/lib/applicationFormEvaluation";
import { canAccessServer } from "@/lib/server-access";
import { getPublicUrl } from "@/lib/storage";
import {
  serverLookupIdSchema,
  createApplicationSchema,
  queryApplicationsSchema,
} from "@/lib/validation";
import type { ServerApplicationItem } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/servers/:id/applications
 * Player submits an application to join a server.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: tServers("privateNotEnabled") }, { status: 404 });
    }

    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: {
        id: true,
        ownerId: true,
        joinMode: true,
        status: true,
        applicationForm: true,
      },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const canAccessCurrentServer = canAccessServer({
      status: server.status,
      ownerId: server.ownerId,
      currentUserId: authResult.user.id,
      currentUserRole: authResult.user.role,
    });
    if (!canAccessCurrentServer) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    // Server must support applications
    if (server.joinMode !== "apply" && server.joinMode !== "apply_and_invite") {
      return NextResponse.json({ error: tServers("applicationNotAccepted") }, { status: 400 });
    }

    // Check for existing application or membership. Pull the rejected record's
    // formContentHash so we can refuse resubmits when the form changed between
    // rejection and retry.
    const existingApplication = await prisma.serverApplication.findUnique({
      where: { unique_server_application: { serverId: server.id, userId } },
      select: { id: true, status: true, formContentHash: true },
    });
    const existingFormContentHash = existingApplication?.formContentHash ?? null;

    if (existingApplication) {
      if (existingApplication.status === "pending") {
        return NextResponse.json({ error: tServers("applicationPending") }, { status: 409 });
      }
      if (existingApplication.status === "approved") {
        return NextResponse.json({ error: tServers("applicationAlreadyMember") }, { status: 409 });
      }
    }

    // Validate request body
    const body = await request.json().catch(() => null);
    const parsed = createApplicationSchema.safeParse(body, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: tCommon("validationFailed"), details: flattenZodErrorWithLocale(parsed.error, locale) },
        { status: 400 },
      );
    }

    const { mcUsername, formData } = parsed.data;

    // ─── Server-side evaluation gate (Phase 4 hardening) ─────────────────
    // Normalize the owner's stored applicationForm to the canonical OwnerFormConfig and run
    // the shared evaluator. The evaluator is the SOLE truth source for hard-disqualify /
    // score-threshold / pending verdicts. The player runtime never sees the gating data.
    const ownerConfig = normalizeApplicationFormDocument(server.applicationForm);
    const currentFormContentHash = computeFormContentHash(server.applicationForm);

    // Resubmit-after-rejection: refuse if form content has changed since rejection so the
    // player cannot game the gate by waiting for the owner to soften the form.
    if (
      existingApplication?.status === "rejected" &&
      existingFormContentHash &&
      existingFormContentHash !== currentFormContentHash
    ) {
      return NextResponse.json(
        {
          error: "form_changed",
          errorKey: "errors.api.applications.formChangedSinceRejection",
        },
        { status: 409 },
      );
    }

    // Required-field gate: a client can POST {} (or omit fields entirely) and the
    // evaluator alone won't catch it — `autoReject` only triggers when an answer is
    // present, so empty submissions slip past as `pending`. Reject 400 if any visible
    // required field has no usable answer.
    const submittedAnswers = formData ?? {};
    if (ownerConfig) {
      const visibleFields = computeVisibleFields(ownerConfig, submittedAnswers);
      const missingRequired = findMissingRequiredFields(visibleFields, submittedAnswers);
      if (missingRequired.length > 0) {
        return NextResponse.json(
          {
            error: "missing_required_fields",
            errorKey: "errors.api.applications.missingRequiredFields",
            details: { missing: missingRequired },
          },
          { status: 400 },
        );
      }
    }

    const evalResult = ownerConfig
      ? evaluateApplication(ownerConfig, submittedAnswers)
      : null;

    // Map the evaluator verdict to the persisted application status. `pending_review` is the
    // existing manual-review queue; `score_below_threshold` and `hard_disqualify` auto-reject.
    const initialStatus =
      evalResult?.result === "hard_disqualify" || evalResult?.result === "score_below_threshold"
        ? "rejected"
        : "pending";

    // Embed `_evaluation` inside formData (Decision 1 Option B). Strip helper guarantees this
    // never reaches non-owner viewers — see GET applications response.
    const storedFormData: Record<string, unknown> = {
      ...formData,
      mcUsername,
      ...(evalResult ? { _evaluation: evalResult } : {}),
    };

    try {
      // Project the evaluator output for the player. Owner sees the full result via GET; the
      // applicant only ever receives what their owner-configured transparency toggles permit.
      const playerEval = evalResult
        ? pickPlayerEvaluationView(evalResult, ownerConfig?.settings ?? null)
        : null;

      // Resubmit-after-rejection (form unchanged path): re-use the existing record.
      if (existingApplication?.status === "rejected") {
        const updated = await prisma.serverApplication.update({
          where: { id: existingApplication.id },
          data: {
            status: initialStatus,
            formData: storedFormData as Prisma.InputJsonValue,
            reviewNote: null,
            reviewedBy: null,
            formContentHash: currentFormContentHash,
          },
        });
        return NextResponse.json(
          { data: { id: updated.id, status: initialStatus, evaluationResult: playerEval } },
          { status: 201 },
        );
      }

      const application = await prisma.serverApplication.create({
        data: {
          serverId: server.id,
          userId,
          status: initialStatus,
          formData: storedFormData as Prisma.InputJsonValue,
          formContentHash: currentFormContentHash,
        },
      });

      return NextResponse.json(
        { data: { id: application.id, status: initialStatus, evaluationResult: playerEval } },
        { status: 201 },
      );
    } catch (writeErr) {
      // Translate Prisma P2002 (unique constraint conflict) — this races when two parallel
      // POSTs hit the same (serverId, userId) and the existence check above missed.
      if (
        writeErr instanceof Prisma.PrismaClientKnownRequestError &&
        writeErr.code === "P2002"
      ) {
        return NextResponse.json(
          {
            error: "duplicate",
            errorKey: "errors.api.applications.duplicateActiveApplication",
          },
          { status: 409 },
        );
      }
      throw writeErr;
    }
  } catch (err) {
    logger.error("[api/servers/[id]/applications] Unexpected POST error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * GET /api/servers/:id/applications
 * Server owner lists applications (with status filter and pagination).
 */
export async function GET(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: tServers("privateNotEnabled") }, { status: 404 });
    }

    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    // Check caller scope: owner/admin sees all, applicant sees own, others 403.
    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: { id: true, ownerId: true, applicationForm: true },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const isOwnerOrAdmin = server.ownerId === userId || authResult.user.role === "admin";
    let isApplicant = false;
    if (!isOwnerOrAdmin) {
      const ownApplication = await prisma.serverApplication.findUnique({
        where: { unique_server_application: { serverId: server.id, userId } },
        select: { id: true },
      });
      isApplicant = ownApplication !== null;
    }

    if (!isOwnerOrAdmin && !isApplicant) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const parsedQuery = queryApplicationsSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    }, {
      errorMap: getZodErrorMap(locale),
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: tCommon("validationFailed"),
          details: flattenZodErrorWithLocale(parsedQuery.error, locale),
        },
        { status: 400 },
      );
    }

    const { page, limit, status } = parsedQuery.data;

    const where: { serverId: string; status?: string; userId?: string } = { serverId: server.id };
    if (status !== "all") {
      where.status = status;
    }
    // Applicants can only see their own application(s).
    if (!isOwnerOrAdmin) {
      where.userId = userId;
    }
    const ownerSettings = isOwnerOrAdmin
      ? null
      : normalizeApplicationFormDocument(server.applicationForm)?.settings ?? null;

    const [total, applications] = await Promise.all([
      prisma.serverApplication.count({ where }),
      prisma.serverApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
          reviewer: {
            select: { name: true },
          },
        },
      }),
    ]);

    const data: ServerApplicationItem[] = applications.map((app) => {
      const rawFormData = app.formData as Record<string, unknown> | null;
      const mcUsername =
        typeof rawFormData?.mcUsername === "string" ? rawFormData.mcUsername : "";

      // Strip internal keys (mcUsername + _evaluation) via shared helper, then narrow to string|string[].
      const stripped = stripInternalFormDataKeys(rawFormData);
      let responseFormData: Record<string, string | string[]> | null = null;
      if (stripped) {
        const cleaned: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(stripped)) {
          if (typeof value === "string") {
            cleaned[key] = value;
          } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
            cleaned[key] = value as string[];
          }
        }
        responseFormData = Object.keys(cleaned).length > 0 ? cleaned : null;
      }

      const rawEvaluation = readEmbeddedEvaluation(rawFormData);
      const evaluationResult =
        rawEvaluation && !isOwnerOrAdmin
          ? pickPlayerEvaluationView(rawEvaluation, ownerSettings)
          : rawEvaluation;
      const formContentHash = app.formContentHash ?? null;

      return {
        id: app.id,
        userId: app.user.id,
        userName: app.user.name,
        userImage: getPublicUrl(app.user.image),
        mcUsername,
        status: app.status as ServerApplicationItem["status"],
        formData: responseFormData,
        evaluationResult,
        formContentHash,
        reviewNote: app.reviewNote,
        reviewerName: app.reviewer?.name ?? null,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      data,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    logger.error("[api/servers/[id]/applications] Unexpected GET error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
