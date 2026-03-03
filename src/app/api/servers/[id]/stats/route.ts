export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { queryServerStatsSchema, serverIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type StatsPeriod = "24h" | "7d" | "30d";

interface StatusRecord {
  checkedAt: Date;
  online: boolean;
  playerCount: number | null;
  maxPlayers: number | null;
}

interface TimeSlot {
  key: string;
  label: string;
}

interface SlotBucket {
  sumPlayers: number;
  recordCount: number;
  maxPlayers: number;
  onlineCount: number;
}

interface StatsDataPoint {
  time: string;
  playerCount: number;
  maxPlayers: number;
  isOnline: boolean;
}

interface StatsSummary {
  avgPlayers: number;
  peakPlayers: number;
  peakTime: string;
  uptimePercent: number;
  totalChecks: number;
  onlineChecks: number;
}

interface HourlyAveragePoint {
  hour: string;
  avgPlayers: number;
  sampleCount: number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function startOfHour(date: Date): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addHours(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setHours(next.getHours() + amount);
  return next;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function toHourKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}`;
}

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatHourLabel(date: Date): string {
  return `${pad(date.getHours())}:00`;
}

function formatDayLabel(date: Date): string {
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function resolvePeriodWindow(period: StatsPeriod, now: Date): { startAt: Date; slots: TimeSlot[] } {
  if (period === "24h") {
    const endHour = startOfHour(now);
    const startHour = addHours(endHour, -23);
    const slots: TimeSlot[] = Array.from({ length: 24 }, (_, index) => {
      const slotDate = addHours(startHour, index);
      return {
        key: toHourKey(slotDate),
        label: formatHourLabel(slotDate),
      };
    });

    return { startAt: startHour, slots };
  }

  const dayCount = period === "7d" ? 7 : 30;
  const endDay = startOfDay(now);
  const startDay = addDays(endDay, -(dayCount - 1));
  const slots: TimeSlot[] = Array.from({ length: dayCount }, (_, index) => {
    const slotDate = addDays(startDay, index);
    return {
      key: toDayKey(slotDate),
      label: formatDayLabel(slotDate),
    };
  });

  return { startAt: startDay, slots };
}

function aggregateDataPoints(
  period: StatsPeriod,
  slots: TimeSlot[],
  statuses: StatusRecord[],
): StatsDataPoint[] {
  const buckets = new Map<string, SlotBucket>();
  for (const slot of slots) {
    buckets.set(slot.key, {
      sumPlayers: 0,
      recordCount: 0,
      maxPlayers: 0,
      onlineCount: 0,
    });
  }

  for (const status of statuses) {
    const key = period === "24h" ? toHourKey(status.checkedAt) : toDayKey(status.checkedAt);
    const target = buckets.get(key);
    if (!target) {
      continue;
    }

    target.sumPlayers += Math.max(status.playerCount ?? 0, 0);
    target.recordCount += 1;
    target.maxPlayers = Math.max(target.maxPlayers, status.maxPlayers ?? 0);
    if (status.online) {
      target.onlineCount += 1;
    }
  }

  return slots.map((slot) => {
    const bucket = buckets.get(slot.key);
    if (!bucket || bucket.recordCount === 0) {
      return {
        time: slot.label,
        playerCount: 0,
        maxPlayers: 0,
        isOnline: false,
      };
    }

    return {
      time: slot.label,
      playerCount: Math.round(bucket.sumPlayers / bucket.recordCount),
      maxPlayers: bucket.maxPlayers,
      isOnline: bucket.onlineCount > 0,
    };
  });
}

function buildSummary(dataPoints: StatsDataPoint[], statuses: StatusRecord[]): StatsSummary {
  const totalChecks = statuses.length;
  const onlineChecks = statuses.filter((status) => status.online).length;
  const totalPlayers = statuses.reduce(
    (sum, status) => sum + Math.max(status.playerCount ?? 0, 0),
    0,
  );

  if (totalChecks === 0 || dataPoints.length === 0) {
    return {
      avgPlayers: 0,
      peakPlayers: 0,
      peakTime: "暂无数据",
      uptimePercent: 0,
      totalChecks,
      onlineChecks,
    };
  }

  const peakPoint = dataPoints.reduce((highest, current) =>
    current.playerCount > highest.playerCount ? current : highest,
  );

  return {
    avgPlayers: Math.round(totalPlayers / totalChecks),
    peakPlayers: peakPoint.playerCount,
    peakTime: peakPoint.time,
    uptimePercent: Number(((onlineChecks / totalChecks) * 100).toFixed(1)),
    totalChecks,
    onlineChecks,
  };
}

function buildHourlyAverages(statuses: StatusRecord[]): HourlyAveragePoint[] {
  const buckets = Array.from({ length: 24 }, () => ({ sumPlayers: 0, sampleCount: 0 }));

  for (const status of statuses) {
    const hour = status.checkedAt.getHours();
    const bucket = buckets[hour];
    bucket.sumPlayers += Math.max(status.playerCount ?? 0, 0);
    bucket.sampleCount += 1;
  }

  return buckets.map((bucket, hour) => ({
    hour: `${pad(hour)}:00`,
    avgPlayers: bucket.sampleCount > 0 ? Math.round(bucket.sumPlayers / bucket.sampleCount) : 0,
    sampleCount: bucket.sampleCount,
  }));
}

/**
 * GET /api/servers/:id/stats
 * 获取指定服务器在目标周期内的聚合统计，仅服主可访问。
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedServerId = serverIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = queryServerStatsSchema.safeParse({
      period: searchParams.get("period") ?? undefined,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const server = await prisma.server.findUnique({
      where: { id: parsedServerId.data },
      select: {
        id: true,
        ownerId: true,
      },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限查看该服务器统计" }, { status: 403 });
    }

    const period: StatsPeriod = parsedQuery.data.period;
    const { startAt, slots } = resolvePeriodWindow(period, new Date());

    const statuses = await prisma.serverStatus.findMany({
      where: {
        serverId: server.id,
        checkedAt: {
          gte: startAt,
        },
      },
      orderBy: {
        checkedAt: "asc",
      },
      select: {
        checkedAt: true,
        online: true,
        playerCount: true,
        maxPlayers: true,
      },
    });

    const dataPoints = aggregateDataPoints(period, slots, statuses);
    const summary = buildSummary(dataPoints, statuses);
    const hourlyAverages = buildHourlyAverages(statuses);

    return NextResponse.json({
      period,
      dataPoints,
      summary,
      hourlyAverages,
    });
  } catch (error) {
    logger.error("[api/servers/[id]/stats] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
