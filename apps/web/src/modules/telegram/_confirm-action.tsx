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

  return (
    <AlertDialog isOpen={open} onOpenChange={setOpen}>
      <Button isDisabled={pending || isDisabled} variant="danger-soft">
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
              <Button
                isDisabled={pending || isDisabled}
                slot="close"
                variant="secondary"
              >
                انصراف
              </Button>
              <Button
                isDisabled={isDisabled}
                isPending={pending}
                onPress={() => {
                  void onConfirm()
                    .then(() => setOpen(false))
                    .catch(() => undefined);
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
