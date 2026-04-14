import { redirect } from "next/navigation";

import { buildServerListPath, parseServerListQuery } from "@/lib/serverListPage";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getFirstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function buildServerSearchRedirectPath(
  rawSearchParams: Record<string, string | string[] | undefined>,
): string {
  const query = parseServerListQuery(rawSearchParams);
  const legacySearch = query.search || getFirstValue(rawSearchParams.q).trim();

  return `/servers${buildServerListPath({
    ...query,
    search: legacySearch,
  })}`;
}

export default async function SearchPageRoute({ searchParams }: SearchPageProps) {
  const rawSearchParams = await searchParams;
  redirect(buildServerSearchRedirectPath(rawSearchParams));
}
