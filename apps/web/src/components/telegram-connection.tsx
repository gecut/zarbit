import { CheckCircleIcon } from "@solar-icons/react/linear/check-circle";
import { DangerCircleIcon } from "@solar-icons/react/linear/danger-circle";
import { LinkIcon } from "@solar-icons/react/linear/link";
import { QrCodeIcon } from "@solar-icons/react/linear/qr-code";
import { RefreshCircleIcon } from "@solar-icons/react/linear/refresh-circle";
import { UnlinkIcon } from "@solar-icons/react/linear/unlink";

import type { TelegramSessionState } from "../lib/api";
import { useCreateTelegramQrChallenge, useDisconnectTelegramSession, useTelegramSession } from "../lib/telegram-session";

const stateLabels: Record<TelegramSessionState, string> = {
  DISCONNECTED: "متصل نیست",
  PENDING_QR: "در انتظار اسکن QR",
  ACTIVE: "متصل و آماده",
  NOT_IN_GROUP: "عضو گروه معامله نیستید",
  REVOKED: "اتصال قطع شده",
  ERROR: "نیازمند اتصال مجدد",
};

function statusTone(state: TelegramSessionState) {
  if (state === "ACTIVE") return "active";
  if (state === "PENDING_QR" || state === "NOT_IN_GROUP") return "warning";
  if (state === "ERROR" || state === "REVOKED") return "failed";
  return "";
}

function expiresAt(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function TelegramConnection() {
  const session = useTelegramSession();
  const createQr = useCreateTelegramQrChallenge();
  const disconnect = useDisconnectTelegramSession();
  const data = session.data;
  const state = data?.state ?? "DISCONNECTED";
  const isActive = state === "ACTIVE";
  const isPending = state === "PENDING_QR";
  const expiry = expiresAt(data?.qrExpiresAt ?? null);

  return <section className="page-stack">
    <div className="page-heading"><div><h1>اتصال تلگرام</h1><p>اتصال امن حساب شما برای اجرای سفارش‌ها</p></div></div>
    <article className="surface connection-card">
      <div className="connection-card__header">
        <span className="connection-card__icon" aria-hidden="true"><QrCodeIcon size={25} /></span>
        <div><h1>حساب تلگرام شما</h1><p className="connection-card__description">فقط با حسابی که این مینی‌اپ را باز کرده وارد شوید.</p></div>
      </div>
      {session.isLoading ? <p className="query-state">در حال دریافت وضعیت اتصال…</p> : <>
        <div className="connection-status">
          <span className="connection-status__text">وضعیت اتصال</span>
          <span className={`status-badge status-badge--${statusTone(state)}`}><span aria-hidden="true">{isActive ? "●" : "•"}</span>{stateLabels[state]}</span>
        </div>
        {session.error ? <p role="alert" className="connection-message"><DangerCircleIcon size={18} />{session.error.message}</p> : null}
        {data?.lastError ? <p role="alert" className="connection-message"><DangerCircleIcon size={18} />{data.lastError}</p> : null}
        {isPending && data?.qrImage ? <div className="qr-panel"><img src={data.qrImage} width="280" height="280" alt="QR ورود تلگرام" /><p>QR را با حسابی که مینی‌اپ را باز کرده اسکن کنید و ورود را روی دستگاه دوم تأیید کنید.{expiry ? ` این کد تا ساعت ${expiry} معتبر است.` : ""}</p></div> : null}
        {isPending && !data?.qrImage ? <p className="query-state">در حال آماده‌سازی QR…</p> : null}
      </>}
      <div className="connection-actions">
        <button className="button button--primary" disabled={isActive || createQr.isPending} onClick={() => createQr.mutate()}>{createQr.isPending ? "در حال ساخت…" : isPending ? <><RefreshCircleIcon size={18} />QR جدید</> : <><LinkIcon size={18} />اتصال با QR</>}</button>
        <button className="button button--secondary" disabled={!data || state === "DISCONNECTED" || disconnect.isPending} onClick={() => disconnect.mutate()}>{disconnect.isPending ? "در حال قطع…" : <><UnlinkIcon size={18} />قطع اتصال</>}</button>
      </div>
      <div className="connection-guide">
        <p className="connection-guide__title">راهنمای اتصال</p>
        <div className="connection-guide__item"><span className="connection-guide__number">۱</span><span>روی «اتصال با QR» بزنید تا کد امن و کوتاه‌مدت ساخته شود.</span></div>
        <div className="connection-guide__item"><span className="connection-guide__number">۲</span><span>کد را از تلگرامِ همان حساب اسکن و روی دستگاه دوم تأیید کنید.</span></div>
        <div className="connection-guide__item"><span className="connection-guide__number"><CheckCircleIcon size={14} /></span><span>پس از تأیید و بررسی عضویت گروه، امکان ثبت درخواست فعال می‌شود.</span></div>
      </div>
    </article>
  </section>;
}
