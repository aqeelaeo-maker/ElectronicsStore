import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../lib/utils';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  itemName?: string;
  itemsPerPageOptions?: number[];
  className?: string;
}

export const DEFAULT_ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100, -1];

export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemName = 'items',
  itemsPerPageOptions = DEFAULT_ITEMS_PER_PAGE_OPTIONS,
  className
}: PaginationProps) {
  const isAll = itemsPerPage === -1;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startIndex = totalItems === 0 ? 0 : (isAll ? 0 : (safeCurrentPage - 1) * itemsPerPage);
  const endIndex = isAll ? totalItems : Math.min(startIndex + itemsPerPage, totalItems);

  // Generate page numbers to display with smart ellipsis
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];
    pages.push(1);

    if (safeCurrentPage > 3) {
      pages.push('dots-prev');
    }

    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(totalPages - 1, safeCurrentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (safeCurrentPage < totalPages - 2) {
      pages.push('dots-next');
    }

    pages.push(totalPages);
    return pages;
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value);
    onItemsPerPageChange(val);
    onPageChange(1);
  };

  return (
    <div
      className={cn(
        "px-4 py-3 bg-slate-50/70 border-t border-slate-150 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs",
        className
      )}
    >
      {/* Left side: Showing X to Y of Z items & Items per page dropdown */}
      <div className="flex flex-wrap items-center gap-3 text-slate-600">
        <span className="font-medium text-slate-500">
          {totalItems === 0 ? (
            `No ${itemName}`
          ) : (
            <>
              Showing <span className="font-bold text-slate-900">{startIndex + 1}</span> to{' '}
              <span className="font-bold text-slate-900">{endIndex}</span> of{' '}
              <span className="font-bold text-slate-900">{totalItems}</span> {itemName}
            </>
          )}
        </span>

        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
          <label htmlFor="items-per-page-select" className="text-slate-500 font-semibold text-[11px] whitespace-nowrap">
            Per page:
          </label>
          <select
            id="items-per-page-select"
            value={itemsPerPage}
            onChange={handleSelectChange}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 shadow-2xs focus:ring-1 focus:ring-emerald-700 focus:outline-none cursor-pointer"
          >
            {itemsPerPageOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt === -1 ? 'All' : opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right side: Page navigation */}
      <div className="flex items-center gap-1">
        {/* First page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safeCurrentPage <= 1 || isAll}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="First Page"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Previous page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1 || isAll}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Previous Page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Page numbers */}
        {!isAll && (
          <div className="flex items-center gap-0.5 px-1">
            {getPageNumbers().map((p, idx) => {
              if (typeof p === 'string') {
                return (
                  <span key={`${p}-${idx}`} className="px-1.5 text-slate-400 font-bold select-none">
                    …
                  </span>
                );
              }
              const isCurrent = p === safeCurrentPage;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  className={cn(
                    "min-w-[28px] h-7 px-1.5 rounded-lg font-bold text-xs transition-all flex items-center justify-center",
                    isCurrent
                      ? "bg-[#0a382c] text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        )}

        {/* Next page */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= totalPages || isAll}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Next Page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={safeCurrentPage >= totalPages || isAll}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          title="Last Page"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
