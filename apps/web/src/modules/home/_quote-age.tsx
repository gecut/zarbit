import { useEffect, useState } from "react";
import { TRADE_MAX_AGE_MS } from "@zarbit/domain";
import { formatRelativeDateTime } from "@zarbit/format";

interface QuoteAgeProps {
  announcedAt?: string;
  asOf?: string;
}

export function QuoteAge({ announcedAt, asOf }: QuoteAgeProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stale =
    announcedAt != null && now - Date.parse(announcedAt) > TRADE_MAX_AGE_MS;
  return (
    <div className="text-muted grid gap-1 text-xs">
      <span>
        همگام‌سازی:{" "}
        {asOf ? formatRelativeDateTime(asOf, now) : "در انتظار داده"}
      </span>
      {stale && (
        <span role="status" className="text-warning-soft-foreground">
          معامله قدیمی است؛ اجرای خودکار منتظر معاملهٔ تازه است.
        </span>
      )}
    </div>
  );
}
