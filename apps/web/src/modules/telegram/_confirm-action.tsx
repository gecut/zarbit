import { AlertDialog, Button } from "@heroui/react";
import { useState } from "react";

type ConfirmActionProps = {
  description: string;
  isDisabled: boolean;
  label: string;
  onConfirm: () => Promise<void>;
  pending: boolean;
  title: string;
};

export function ConfirmAction({
  description,
  isDisabled,
  label,
  onConfirm,
  pending,
  title,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AlertDialog isOpen={open} onOpenChange={setOpen}>
      <Button
        isDisabled={pending || submitting || isDisabled}
        variant="danger-soft"
      >
        {label}
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog dir="rtl">
            <AlertDialog.Header>
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              {description}
              {error ? (
                <p role="alert" className="text-danger mt-3">
                  {error}
                </p>
              ) : null}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                isDisabled={pending || submitting || isDisabled}
                slot="close"
                variant="secondary"
              >
                انصراف
              </Button>
              <Button
                isDisabled={isDisabled || submitting}
                isPending={pending || submitting}
                onPress={() => {
                  setSubmitting(true);
                  setError(null);
                  void onConfirm()
                    .then(() => setOpen(false))
                    .catch(() =>
                      setError("ثبت قطع اتصال تأیید نشد؛ وضعیت را بررسی کنید."),
                    )
                    .finally(() => setSubmitting(false));
                }}
                variant="danger"
              >
                تأیید {label}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
