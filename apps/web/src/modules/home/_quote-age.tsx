import { useEffect, useState } from "react";

export function QuoteAge({ announcedAt }: { announcedAt?: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!announcedAt || now - Date.parse(announcedAt) < 300_000) return null;
  return (
    <p className="text-warning-soft-foreground bg-warning-soft rounded-xl px-3 py-2 text-xs">
      آخرین مظنه بیش از پنج دقیقه پیش اعلام شده است.
    </p>
  );
}
