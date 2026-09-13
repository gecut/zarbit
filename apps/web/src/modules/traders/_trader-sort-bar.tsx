import { Button, Card, cn } from "@heroui/react";
import {
  SortFromBottomToTopIcon,
  SortFromTopToBottomIcon,
} from "@solar-icons/react/linear";
import type { SortOrder, TraderSortField } from "@zarbit/contracts";

const sortOptions: Array<{ field: TraderSortField; label: string }> = [
  { field: "REALIZED_PNL", label: "سود" },
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
    <Card
      role="toolbar"
      aria-label="مرتب‌سازی فعالان بازار"
      className="z-20 flex flex-col gap-2"
    >
      <Card.Header>
        <div className="space-y-1">
          <Card.Title className="text-foreground text-xl font-bold tracking-tight">
            فعالان و نهنگ‌های بازار
          </Card.Title>
          <Card.Description className="text-muted text-xs leading-5">
            رتبه‌بندی عملکرد ۷ روز گذشته بر اساس حواله‌های معامله قطعی گروه
            تلگرام
          </Card.Description>
        </div>
      </Card.Header>

      <Card.Content>
        <span className="text-muted text-xs font-medium">مرتب‌سازی:</span>

        <div className="flex w-full gap-2">
          {sortOptions.map(({ field, label }) => {
            const active = sortBy === field;
            return (
              <Button
                key={field}
                size="sm"
                variant={active ? "primary" : "tertiary"}
                className={cn(
                  "h-8 grow px-1 text-xs font-medium transition-colors",
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
                {active && (
                  <span className="">
                    {sortOrder === "DESC" ? (
                      <SortFromBottomToTopIcon className="size-4" />
                    ) : (
                      <SortFromTopToBottomIcon className="size-4" />
                    )}
                  </span>
                )}

                {label}
              </Button>
            );
          })}
        </div>
      </Card.Content>
    </Card>
  );
}
