"use client";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

type PageItem = number | "ellipsis";

function buildPageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);

  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page > 1 && page < totalPages) {
      pages.add(page);
    }
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b);
  const items: PageItem[] = [];

  for (let index = 0; index < sortedPages.length; index += 1) {
    const page = sortedPages[index];
    const prev = sortedPages[index - 1];
    if (prev !== undefined && page - prev > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  }

  return items;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pageItems = buildPageItems(currentPage, totalPages);

  return (
    <nav className="mt-8" aria-label="分页导航">
      <div className="flex items-center justify-center gap-4 sm:hidden">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          上一页
        </button>
        <span className="text-sm text-slate-600">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          下一页
        </button>
      </div>

      <div className="hidden flex-wrap items-center justify-center gap-2 sm:flex">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          上一页
        </button>

        {pageItems.map((item, index) => {
          if (item === "ellipsis") {
            return (
              <span key={`ellipsis-${index}`} className="px-2 text-sm text-slate-500">
                ...
              </span>
            );
          }

          const isActive = item === currentPage;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              className={`m3-btn rounded-lg px-3 py-1.5 ${
                isActive ? "m3-btn-primary" : "m3-btn-tonal"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {item}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="m3-btn m3-btn-tonal rounded-lg px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          下一页
        </button>
      </div>
    </nav>
  );
}
