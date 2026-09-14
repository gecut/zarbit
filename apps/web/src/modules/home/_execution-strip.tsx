import type { CreateRequestInput } from "@zarbit/contracts";
import { Button } from "@heroui/react";
import {
  ImportIcon,
  ExportIcon,
  BellRingIcon,
} from "@solar-icons/react/linear";

export interface ExecutionStripProps {
  onActionSelect: (action: CreateRequestInput["action"]) => void;
}

export function ExecutionStrip({ onActionSelect }: ExecutionStripProps) {
  return (
    <div
      role="group"
      aria-label="عملیات معاملاتی سریع"
      className="grid grid-cols-3 gap-4"
    >
      <Button
        variant="danger-soft"
        onPress={() => onActionSelect("ALERT")}
        size="lg"
        fullWidth
      >
        <BellRingIcon className="size-5" />
        <span className="text-sm">هشدار</span>
      </Button>

      <Button
        onPress={() => onActionSelect("BUY")}
        variant="primary"
        size="lg"
        fullWidth
      >
        <ImportIcon className="size-5" />
        <span className="text-sm">خرید</span>
      </Button>

      <Button
        variant="danger"
        onPress={() => onActionSelect("SELL")}
        size="lg"
        fullWidth
      >
        <ExportIcon className="size-5" />
        <span className="text-sm">فروش</span>
      </Button>
    </div>
  );
}
