import { useRegisterSW } from "virtual:pwa-register/react";
import { Button, Card } from "@heroui/react";
import { useIsMutating } from "@tanstack/react-query";
export function PwaUpdate() {
  const {
    needRefresh: [ready],
    updateServiceWorker,
  } = useRegisterSW();
  const mutating = useIsMutating();
  if (!ready) return null;
  return (
    <Card
      className="border-border bg-surface shadow-surface mt-4 grid gap-3 rounded-[var(--radius-2xl)] border p-[1.15rem] sm:p-[1.45rem]"
      role="status"
    >
      <p className="text-foreground text-sm leading-7">
        نسخه جدید زربیت آماده است. ابتدا ورود یا تغییرات فرم خود را تمام کنید.
      </p>
      <Button
        isDisabled={mutating > 0}
        onPress={() => {
          void updateServiceWorker(true);
        }}
      >
        بارگذاری نسخه جدید
      </Button>
    </Card>
  );
}
