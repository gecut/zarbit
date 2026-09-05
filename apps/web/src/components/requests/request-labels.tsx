import { BellIcon } from "@solar-icons/react/linear/bell";
import { ChartIcon } from "@solar-icons/react/linear/chart";
import { WalletIcon } from "@solar-icons/react/linear/wallet";

import type { RequestAction } from "../../lib/api";

export const statusLabels = {
  ACTIVE: "فعال",
  DONE: "انجام‌شده",
  CANCELLED: "لغوشده",
  FAILED: "ناموفق",
} as const;

export const actionLabels = {
  ALERT: "فقط هشدار",
  BUY: "خرید",
  SELL: "فروش",
} as const;

export const conditionLabels = {
  LTE: "قیمت کمتر یا مساوی",
  GTE: "قیمت بیشتر یا مساوی",
} as const;

export function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

type ActionIconProps = {
  action: RequestAction;
  size?: number;
};

export function ActionIcon({ action, size = 19 }: ActionIconProps) {
  if (action === "BUY") return <WalletIcon size={size} />;
  if (action === "SELL") return <ChartIcon size={size} />;
  return <BellIcon size={size} />;
}
