import { useEffect, useState } from "react";
import { relativeTimeFromNow } from "./_market-format";

interface QuoteAgeProps {
  announcedAt?: string;
  asOf?: string;
}

export function QuoteAge({ announcedAt, asOf }: QuoteAgeProps) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const stale = announcedAt != null && now - Date.parse(announcedAt) >= 300_000;
  return (
    <div className="text-muted grid gap-1 text-xs">
      <span>
        همگام‌سازی: {asOf ? relativeTimeFromNow(asOf, now) : "در انتظار داده"}
      </span>
      {stale && (
        <span role="status" className="text-warning-soft-foreground">
          مظنه قدیمی است؛ بیش از ۵ دقیقه از اعلام آن گذشته است.
        </span>
      )}
    </div>
  );
}
