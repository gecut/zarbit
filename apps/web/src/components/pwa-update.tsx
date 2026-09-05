import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@heroui/react";
import { useIsMutating } from "@tanstack/react-query";
export function PwaUpdate() {
  const {
    needRefresh: [ready],
    updateServiceWorker,
  } = useRegisterSW();
  const mutating = useIsMutating();
  if (!ready) return null;
  return (
    <aside className="zb-surface form-card" role="status">
      <p>
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
    </aside>
  );
}
