import { Button, cn } from "@heroui/react";
import type { SortOrder, TraderSortField } from "@zarbit/contracts";

const sortOptions: Array<{ field: TraderSortField; label: string }> = [
  { field: "REALIZED_PNL", label: "سود محقق‌شده" },
  { field: "VOLUME", label: "حجم" },
  { field: "TRADE_COUNT", label: "تعداد" },
  { field: "AVG_TRADE_SIZE", label: "میانگین حجم" },
];

export function TraderSortBar({
  sortBy,
  sortOrder,
  onChange,
}: {
  sortBy: TraderSortField;
  sortOrder: SortOrder;
  onChange: (sortBy: TraderSortField, sortOrder: SortOrder) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="مرتب‌سازی فعالان بازار"
      className="border-border bg-surface/50 backdrop-blur-xs flex flex-wrap items-center gap-1.5 rounded-2xl border p-1.5"
    >
      <span className="text-muted px-2 text-xs font-medium">مرتب‌سازی:</span>
      {sortOptions.map(({ field, label }) => {
        const active = sortBy === field;
        return (
          <Button
            key={field}
            size="sm"
            variant={active ? "primary" : "tertiary"}
            className={cn(
              "h-8 rounded-xl px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground font-semibold"
                : "text-muted hover:text-foreground",
            )}
            onPress={() => {
              if (active) {
                // Toggle order if clicked again
                onChange(field, sortOrder === "DESC" ? "ASC" : "DESC");
              } else {
                onChange(field, "DESC");
              }
            }}
          >
            {label}
            {active && (
              <span className="mr-0.5 text-[10px]">
                {sortOrder === "DESC" ? "↓" : "↑"}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
