import { Button, Card } from "@heroui/react";
import { Link } from "@tanstack/react-router";

import { useLatestQuote } from "../lib/quote";

function formatQuote(value: number) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

const staleAfterMs = 5 * 60_000;

export function LatestQuote() {
  const quote = useLatestQuote();

  if (quote.isPending)
    return (
      <p className="border-border text-muted rounded-[var(--radius-2xl)] border border-dashed px-4 py-7 text-center text-sm leading-7">
        در حال دریافت آخرین مظنه…
      </p>
    );
  if (quote.error)
    return (
      <Card className="border-danger-soft bg-danger-soft text-danger-soft-foreground rounded-[var(--radius-2xl)] border p-5 text-center">
        <p className="text-sm leading-7">{quote.error.message}</p>
        <Button onPress={() => void quote.refetch()} variant="secondary">
          تلاش دوباره
        </Button>
      </Card>
    );
  if (!quote.data)
    return (
      <Card className="border-border bg-surface shadow-surface rounded-[var(--radius-2xl)] border p-5 text-center">
        <h1 className="text-foreground text-base font-semibold">
          هنوز مظنه‌ای دریافت نشده است
        </h1>
        <p className="text-muted mt-2 text-sm leading-7">
          پس از اتصال یک حساب عضو گروه، آخرین مظنه اینجا نمایش داده می‌شود.
        </p>
        <Link
          className="bg-accent text-accent-foreground mt-4 inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold"
          to="/telegram"
        >
          اتصال تلگرام
        </Link>
      </Card>
    );

  const isStale =
    Date.now() - new Date(quote.data.announcedAt).getTime() > staleAfterMs;

  return (
    <section className="grid gap-4">
      <Card className="text-accent-foreground shadow-surface rounded-[var(--radius-2xl)] bg-[linear-gradient(132deg,var(--accent),var(--accent-hover)_56%,var(--accent))] p-5 sm:p-7">
        <p className="text-sm font-semibold">آخرین مظنه</p>
        <p className="mt-3 text-4xl font-semibold tracking-[-0.06em]" dir="ltr">
          {formatQuote(quote.data.quote)}
        </p>
        <p className="mt-2 text-sm">تومان</p>
      </Card>
      <Card className="border-border bg-surface shadow-surface rounded-[var(--radius-2xl)] border p-4">
        <p className="text-muted text-xs">آخرین اعلام</p>
        <time
          className="text-foreground mt-1 block text-sm font-semibold"
          dateTime={quote.data.announcedAt}
        >
          {new Date(quote.data.announcedAt).toLocaleString("fa-IR")}
        </time>
        {isStale && (
          <p className="text-warning mt-3 text-sm leading-6">
            این مظنه بیش از پنج دقیقه پیش اعلام شده است.
          </p>
        )}
        <Link
          className="text-accent mt-4 inline-block text-sm font-semibold"
          to="/telegram"
        >
          مدیریت اتصال تلگرام
        </Link>
      </Card>
    </section>
  );
}
