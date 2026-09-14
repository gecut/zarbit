import { Chip, Table } from "@heroui/react";
import type { MarketSnapshot } from "@zarbit/contracts";
import { marketNumber } from "./_market-format";

interface RecentTradesTapeProps {
  data?: MarketSnapshot;
}

// Table has no density prop; cell padding is the only terminal-density override.
const cellClass = "px-2 py-1 text-xs leading-5 tabular-nums";

export function RecentTradesTape({ data }: RecentTradesTapeProps) {
  const trades = data?.recentTrades ?? [];
  const quote = data?.quote?.compactPrice;
  return (
    <section aria-labelledby="recent-trades-title" className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-trades-title" className="text-sm font-semibold">
          معاملات اخیر
        </h2>
        <Chip size="sm" variant="soft">
          <Chip.Label>{marketNumber.format(trades.length)} معامله</Chip.Label>
        </Chip>
      </div>
      <p className="text-muted text-xs">
        قیمت و Δ به هزار تومان · اختلاف با مظنه فعلی
      </p>
      <Table variant="secondary">
        <Table.ScrollContainer>
          <Table.Content aria-label="معاملات اخیر">
            <Table.Header>
              <Table.Column isRowHeader>زمان</Table.Column>
              <Table.Column>قیمت</Table.Column>
              <Table.Column>واحد</Table.Column>
              <Table.Column>Δ</Table.Column>
            </Table.Header>
            <Table.Body
              items={trades.slice(0, 10)}
              renderEmptyState={() => "معامله‌ای برای نمایش وجود ندارد"}
            >
              {(trade) => (
                <Table.Row id={trade.id}>
                  <Table.Cell className={`${cellClass} text-muted`}>
                    <bdi>
                      {new Intl.DateTimeFormat("fa-IR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        timeZone: "Asia/Tehran",
                      }).format(new Date(trade.announcedAt))}
                    </bdi>
                  </Table.Cell>
                  <Table.Cell className={cellClass}>
                    {marketNumber.format(trade.compactPrice)}
                  </Table.Cell>
                  <Table.Cell className={cellClass}>
                    {marketNumber.format(trade.quantity)}
                  </Table.Cell>
                  <Table.Cell
                    className={`${cellClass} ${quote != null && trade.compactPrice - quote > 0 ? "text-success" : quote != null && trade.compactPrice - quote < 0 ? "text-danger" : "text-muted"}`}
                  >
                    <bdi dir="ltr">
                      {quote == null
                        ? "—"
                        : `${trade.compactPrice - quote > 0 ? "+" : ""}${marketNumber.format(trade.compactPrice - quote)}`}
                    </bdi>
                  </Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </section>
  );
}
