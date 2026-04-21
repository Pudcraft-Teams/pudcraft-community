export type ServerSort = "newest" | "popular" | "players" | "name";

export interface ServerListPageQuery {
  page: number;
  sort: ServerSort;
  tag: string;
  search: string;
}

interface RawServerListPageQuery {
  page?: string | string[];
  sort?: string | string[];
  tag?: string | string[];
  search?: string | string[];
}

const DEFAULT_SORT: ServerSort = "newest";
const SORT_VALUES = new Set<ServerSort>(["newest", "popular", "players", "name"]);

function getFirstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function normalizeText(value: string | string[] | undefined): string {
  const trimmed = getFirstValue(value).trim();
  return trimmed.length > 0 ? trimmed : "";
}

function parsePage(value: string | string[] | undefined): number {
  const parsed = Number(getFirstValue(value));
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return Math.floor(parsed);
}

function parseSort(value: string | string[] | undefined): ServerSort {
  const candidate = getFirstValue(value);
  if (SORT_VALUES.has(candidate as ServerSort)) {
    return candidate as ServerSort;
  }

  return DEFAULT_SORT;
}

export function parseServerListQuery(raw: RawServerListPageQuery): ServerListPageQuery {
  return {
    page: parsePage(raw.page),
    sort: parseSort(raw.sort),
    tag: normalizeText(raw.tag),
    search: normalizeText(raw.search),
  };
}

export function buildServerListPath(query: ServerListPageQuery): string {
  const params = new URLSearchParams();

  if (query.tag) {
    params.set("tag", query.tag);
  }

  if (query.search) {
    params.set("search", query.search);
  }

  if (query.sort !== DEFAULT_SORT) {
    params.set("sort", query.sort);
  }

  if (query.page > 1) {
    params.set("page", String(query.page));
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}
