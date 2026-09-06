import { useNavigate } from "@tanstack/react-router";
import { useRequest, useUpdateRequest } from "../../lib/requests";
import { RequestForm } from "./request-form";

type EditRequestProps = { id: string };

export function EditRequest({ id }: EditRequestProps) {
  const request = useRequest(id);
  const update = useUpdateRequest(id);
  const navigate = useNavigate();
  if (request.isLoading)
    return (
      <p className="border-border text-muted rounded-[var(--radius-2xl)] border border-dashed px-4 py-7 text-center text-sm leading-7">
        در حال دریافت درخواست…
      </p>
    );
  if (request.error || !request.data)
    return (
      <p
        role="alert"
        className="border-danger-soft bg-danger-soft text-danger-soft-foreground rounded-[var(--radius-2xl)] border px-4 py-7 text-center text-sm leading-7"
      >
        {request.error?.message ?? "درخواست پیدا نشد."}
      </p>
    );
  if (request.data.status !== "ACTIVE" || request.data.isExecuting)
    return (
      <p className="border-border text-muted rounded-[var(--radius-2xl)] border border-dashed px-4 py-7 text-center text-sm leading-7">
        این درخواست اجرا شده یا در حال اجراست و قابل ویرایش نیست.
      </p>
    );
  return (
    <RequestForm
      error={update.error?.message}
      initial={request.data}
      isPending={update.isPending}
      key={id}
      onSubmit={(input) =>
        update.mutate(input, {
          onSuccess: () => navigate({ to: "/requests/active" }),
        })
      }
    />
  );
}
