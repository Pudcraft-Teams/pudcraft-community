import { Suspense } from "react";
import { SearchPage } from "@/components/forum/SearchPage";

export default function SearchPageRoute() {
  return (
    <Suspense>
      <SearchPage />
    </Suspense>
  );
}
