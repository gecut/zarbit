import type { ReactNode } from "react";

type QueryStateProps = { isLoading: boolean; error: Error | null; isEmpty: boolean; children: ReactNode };

export function QueryState({ isLoading, error, isEmpty, children }: QueryStateProps) {
  if (isLoading) return <p className="rounded-[var(--radius-2xl)] border border-dashed border-border px-4 py-7 text-center text-sm leading-7 text-muted">در حال دریافت اطلاعات…</p>;
  if (error) return <p role="alert" className="rounded-[var(--radius-2xl)] border border-danger-soft bg-danger-soft px-4 py-7 text-center text-sm leading-7 text-danger-soft-foreground">{error.message}</p>;
  if (isEmpty) return <p className="rounded-[var(--radius-2xl)] border border-dashed border-border px-4 py-7 text-center text-sm leading-7 text-muted">هنوز موردی ثبت نشده است.</p>;
  return <>{children}</>;
}
