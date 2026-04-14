import { redirect } from "next/navigation";

import { buildServerListPath, parseServerListQuery } from "@/lib/serverListPage";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPageRoute({ searchParams }: SearchPageProps) {
  const rawSearchParams = await searchParams;
  const query = parseServerListQuery(rawSearchParams);

  redirect(`/servers${buildServerListPath(query)}`);
}
