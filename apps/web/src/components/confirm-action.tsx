import { AlertDialog, Button } from "@heroui/react";
import { useState } from "react";
export function ConfirmAction({
  title,
  description,
  label,
  pending,
  onConfirm,
}: {
  title: string;
  description: string;
  label: string;
  pending?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog isOpen={open} onOpenChange={setOpen}>
      <Button variant="danger-soft" isDisabled={pending}>
        {label}
      </Button>
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog dir="rtl">
            <AlertDialog.Header>
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{description}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button slot="close" variant="secondary" isDisabled={pending}>
                انصراف
              </Button>
              <Button
                variant="danger"
                isPending={pending}
                onPress={() => {
                  void onConfirm()
                    .then(() => setOpen(false))
                    .catch(() => undefined);
                }}
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
