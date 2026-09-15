import { useEffect, useState } from "react";
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
  const stale = announcedAt != null && now - Date.parse(announcedAt) > 60_000;
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
