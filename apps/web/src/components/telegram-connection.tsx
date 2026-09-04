import { Button, Card } from "@heroui/react";

import { useCreateTelegramQrChallenge, useDisconnectTelegramSession, useTelegramSession } from "../lib/telegram-session";

const stateLabels = {
  DISCONNECTED: "متصل نیست",
  PENDING_QR: "در انتظار اسکن QR",
  ACTIVE: "متصل و آماده",
  NOT_IN_GROUP: "عضو گروه نیست",
  REVOKED: "قطع شده",
  ERROR: "نیازمند اتصال مجدد",
} as const;

export function TelegramConnection() {
  const session = useTelegramSession();
  const createQr = useCreateTelegramQrChallenge();
  const disconnect = useDisconnectTelegramSession();
  const data = session.data;
  const isActive = data?.state === "ACTIVE";
  const isPending = data?.state === "PENDING_QR";

  return <Card className="w-full">
    <Card.Header>
      <Card.Title>اتصال حساب تلگرام</Card.Title>
      <Card.Description>سفارش‌ها فقط با حساب تلگرام خود شما ارسال می‌شوند.</Card.Description>
    </Card.Header>
    <Card.Content className="space-y-3">
      {session.isLoading ? <p className="text-sm text-muted">در حال دریافت وضعیت اتصال…</p> : null}
      {session.error ? <p role="alert" className="text-sm text-danger">{session.error.message}</p> : null}
      {data ? <p className={isActive ? "text-sm text-success" : "text-sm text-muted"}>وضعیت: {stateLabels[data.state]}</p> : null}
      {data?.lastError ? <p role="alert" className="text-sm text-danger">{data.lastError}</p> : null}
      {isPending && data.qrImage ? <div className="space-y-3 text-center"><img className="mx-auto rounded-lg bg-white p-2" src={data.qrImage} width="280" height="280" alt="QR ورود تلگرام" /><p className="text-sm text-muted">QR را با حساب تلگرامی که مینی‌اپ را باز کرده اسکن و روی دستگاه دوم تأیید کنید.</p></div> : null}
      {isPending && !data?.qrImage ? <p className="text-sm text-muted">در حال آماده‌سازی QR…</p> : null}
    </Card.Content>
    <Card.Footer className="grid grid-cols-2 gap-2">
      <Button isDisabled={isActive || createQr.isPending} onPress={() => createQr.mutate()}>{createQr.isPending ? "در حال ساخت…" : isPending ? "به‌روزرسانی QR" : "اتصال با QR"}</Button>
      <Button variant="secondary" isDisabled={!data || data.state === "DISCONNECTED" || disconnect.isPending} onPress={() => disconnect.mutate()}>{disconnect.isPending ? "در حال قطع…" : "قطع اتصال"}</Button>
    </Card.Footer>
  </Card>;
}
