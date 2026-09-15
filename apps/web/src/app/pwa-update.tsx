import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Alert, Button } from "@heroui/react";

export function PwaUpdate() {
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    needRefresh: [ready],
    updateServiceWorker,
  } = useRegisterSW();

  if (!ready) return null;

  async function handleUpdate() {
    setIsUpdating(true);

    try {
      await updateServiceWorker(true);
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="bottom-22 fixed inset-x-4 z-50 mx-auto max-w-md">
      <Alert status="success" className="bg-surface/20 backdrop-blur-sm shadow-none border border-border">
        <Alert.Indicator />

        <Alert.Content>
          <Alert.Title>نسخه جدید آماده است</Alert.Title>
          <Alert.Description className="text-xs">
            برای دریافت آخرین بهبودها، مینی‌اپ را بروزرسانی کنید.
          </Alert.Description>

          <Button
            className="ms-auto mt-2 text-xs"
            size="sm"
            variant="primary"
            isPending={isUpdating}
            onPress={() => void handleUpdate()}
          >
            {isUpdating ? "در حال بروزرسانی..." : "بارگذاری نسخه جدید"}
          </Button>
        </Alert.Content>
      </Alert>
    </div>
  );
}
