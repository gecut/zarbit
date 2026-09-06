import type { ReactNode } from "react";

type QueryStateProps = {
  isLoading: boolean;
  error: Error | null;
  isEmpty: boolean;
  children: ReactNode;
};

export function QueryState({
  isLoading,
  error,
  isEmpty,
  children,
}: QueryStateProps) {
  if (isLoading)
    return (
      <p className="border-border text-muted rounded-[var(--radius-2xl)] border border-dashed px-4 py-7 text-center text-sm leading-7">
        در حال دریافت اطلاعات…
      </p>
    );
  if (error)
    return (
      <p
        role="alert"
        className="border-danger-soft bg-danger-soft text-danger-soft-foreground rounded-[var(--radius-2xl)] border px-4 py-7 text-center text-sm leading-7"
      >
        {error.message}
      </p>
    );
  if (isEmpty)
    return (
      <p className="border-border text-muted rounded-[var(--radius-2xl)] border border-dashed px-4 py-7 text-center text-sm leading-7">
        هنوز موردی ثبت نشده است.
      </p>
    );
  return <>{children}</>;
}
