import { Button, Input, Label, TextField, InputOTP } from "@heroui/react";
import { useEffect, useState } from "react";
import { normalizeDigits, type WorkerCommand } from "@zarbit/contracts";
import { useSessionCommand, useTelegramSession } from "../lib/telegram-session";
import { ThemePicker } from "../lib/theme";
import { ConfirmAction } from "./confirm-action";

const states = {
  DISCONNECTED: "متصل نیست",
  PENDING_OTP: "در حال ورود",
  ACTIVE: "حساب متصل",
  NOT_IN_GROUP: "عضویت تأیید نشده",
  REVOKING: "در حال قطع اتصال",
  REVOKED: "اتصال قطع شده",
  ERROR: "نیازمند بررسی",
} as const;
const delivery: Record<string, string> = {
  app: "پیام تلگرام",
  sms: "پیامک",
  call: "تماس تلفنی",
  sms_word: "پیامک",
  sms_phrase: "پیامک",
};
export function TelegramConnection() {
  const query = useTelegramSession();
  const mutation = useSessionCommand();
  const [phone, setPhone] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const session = query.data;
  const login = session?.login;
  useEffect(() => {
    if (!login) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [login?.id]);
  useEffect(() => {
    setSecret("");
    setError(null);
  }, [login?.id, login?.step]);
  const run = async (command: Exclude<WorkerCommand, { type: "status" }>) => {
    setError(null);
    try {
      await mutation.mutateAsync(command);
      setSecret("");
      if (command.type === "login") setPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "عملیات انجام نشد.");
      throw err;
    } finally {
      mutation.reset();
    }
  };
  const remaining = login
    ? Math.max(0, Math.ceil((Date.parse(login.expiresAt) - now) / 1000))
    : 0;
  const resendWait = login?.resendAvailableAt
    ? Math.max(0, Math.ceil((Date.parse(login.resendAvailableAt) - now) / 1000))
    : null;
  const mayLogin =
    session &&
    ["DISCONNECTED", "REVOKED", "ERROR"].includes(session.state) &&
    !login;
  const submit = () => {
    if (mutation.isPending) return;
    const command: Exclude<WorkerCommand, { type: "status" }> = !login
      ? { type: "login", phone }
      : login.step === "PASSWORD"
        ? { type: "password", id: login.id, password: secret }
        : { type: "code", id: login.id, code: normalizeDigits(secret) };
    void run(command).catch(() => undefined);
  };
  return (
    <section className="page-stack">
      <article className="zb-surface connection-card">
        <header className="connection-card__header">
          <div>
            <h1>اتصال حساب تلگرام</h1>
            <p className="connection-card__description">
              سفارش‌ها از حساب خودتان ارسال می‌شوند. کد و رمز دوم فقط برای ورود
              استفاده می‌شوند و ذخیره نمی‌شوند.
            </p>
          </div>
        </header>
        {query.isPending ? <p role="status">در حال دریافت وضعیت…</p> : null}
        {query.error ? (
          <>
            <p role="alert">{query.error.message}</p>
            <Button
              onPress={() => {
                void query.refetch();
              }}
            >
              تلاش دوباره
            </Button>
          </>
        ) : null}
        {session ? (
          <>
            <div className="connection-status">
              <span>{states[session.state]}</span>
              <span
                className={`status-badge status-badge--${session.canManageRequests ? "active" : "warning"}`}
              >
                {session.canManageRequests
                  ? "آماده اجرای درخواست"
                  : session.connection === "CONNECTING"
                    ? "در حال اتصال…"
                    : "اجرای درخواست غیرفعال"}
              </span>
            </div>
            {session.connectedTelegramUserId ? (
              <p className="form-hint">
                شناسه حساب: <bdi>{session.connectedTelegramUserId}</bdi>
              </p>
            ) : null}
            {session.membershipCheckedAt ? (
              <p className="form-hint">
                آخرین بررسی عضویت:{" "}
                {new Date(session.membershipCheckedAt).toLocaleString("fa-IR")}
              </p>
            ) : null}
            {session.error ? (
              <p className="connection-message" role="status">
                {session.error}
              </p>
            ) : null}
            {mayLogin || login ? (
              <form
                className="form-fields login-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                {!login ? (
                  <TextField
                    name="phone"
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    isRequired
                    isDisabled={mutation.isPending}
                  >
                    <Label>شماره تلفن با کد کشور</Label>
                    <Input
                      dir="ltr"
                      autoComplete="tel"
                      placeholder="+989121234567"
                    />
                  </TextField>
                ) : (
                  <>
                    <p>
                      حساب <bdi>{login.maskedPhone}</bdi> —{" "}
                      {login.step === "PASSWORD"
                        ? "رمز دوم تلگرام لازم است."
                        : `کد از طریق ${delivery[login.delivery] ?? "تلگرام"} ارسال شده است.`}
                    </p>
                    <p className="form-hint">
                      زمان باقی‌مانده: {remaining} ثانیه
                    </p>
                    {login.step === "VERIFYING" ? (
                      <p role="status">در حال بررسی حساب و عضویت…</p>
                    ) : login.step === "CODE" &&
                      login.codeLength &&
                      login.codeLength <= 10 ? (
                      <div dir="ltr">
                        <Label id="otp-label">کد ورود</Label>
                        <InputOTP
                          aria-labelledby="otp-label"
                          value={secret}
                          onChange={(value) =>
                            setSecret(normalizeDigits(value))
                          }
                          maxLength={login.codeLength}
                          isDisabled={mutation.isPending || remaining === 0}
                        >
                          <InputOTP.Group>
                            {Array.from(
                              { length: login.codeLength },
                              (_, index) => (
                                <InputOTP.Slot key={index} index={index} />
                              ),
                            )}
                          </InputOTP.Group>
                        </InputOTP>
                      </div>
                    ) : (
                      <TextField
                        name={login.step === "PASSWORD" ? "password" : "code"}
                        type={login.step === "PASSWORD" ? "password" : "text"}
                        value={secret}
                        onChange={setSecret}
                        isRequired
                        isDisabled={mutation.isPending || remaining === 0}
                      >
                        <Label>
                          {login.step === "PASSWORD"
                            ? "رمز دوم تلگرام"
                            : "کد ورود"}
                        </Label>
                        <Input
                          dir="ltr"
                          autoComplete={
                            login.step === "PASSWORD" ? "off" : "one-time-code"
                          }
                          maxLength={1024}
                        />
                      </TextField>
                    )}
                  </>
                )}
                <Button
                  type="submit"
                  isPending={mutation.isPending}
                  isDisabled={
                    login
                      ? !secret || !remaining || login.step === "VERIFYING"
                      : !phone
                  }
                >
                  {!login
                    ? "ارسال کد ورود"
                    : login.step === "PASSWORD"
                      ? "تأیید رمز دوم"
                      : "تأیید کد"}
                </Button>
                {login ? (
                  <div className="connection-actions">
                    <Button
                      variant="secondary"
                      isDisabled={mutation.isPending}
                      onPress={() => {
                        void run({ type: "cancel", id: login.id }).catch(
                          () => undefined,
                        );
                      }}
                    >
                      لغو / تغییر شماره
                    </Button>
                    {login.step === "CODE" ? (
                      <Button
                        variant="secondary"
                        isDisabled={
                          mutation.isPending || resendWait !== 0 || !remaining
                        }
                        onPress={() => {
                          void run({ type: "resend", id: login.id }).catch(
                            () => undefined,
                          );
                        }}
                      >
                        {resendWait
                          ? `ارسال مجدد (${resendWait})`
                          : "ارسال دوباره کد"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </form>
            ) : null}
            {["ACTIVE", "NOT_IN_GROUP", "REVOKING"].includes(session.state) ? (
              <div className="connection-actions">
                <Button
                  variant="secondary"
                  isDisabled={
                    mutation.isPending || session.state === "REVOKING"
                  }
                  onPress={() => {
                    void run({ type: "membership" }).catch(() => undefined);
                  }}
                >
                  بررسی دوباره عضویت
                </Button>
                <ConfirmAction
                  title="اتصال تلگرام قطع شود؟"
                  description="درخواست‌های اجرا‌نشده لغو می‌شوند. سفارش در حال ارسال ممکن است قبلاً به گروه رسیده باشد."
                  label="قطع اتصال"
                  pending={mutation.isPending}
                  onConfirm={() => run({ type: "revoke" })}
                />
              </div>
            ) : null}
          </>
        ) : null}
        {error || login?.error ? (
          <p className="form-error" role="alert">
            {error ?? login?.error}
          </p>
        ) : null}
        <p className="form-hint">
          کد ورود را در چت بات نفرستید. محل دریافت کد را تلگرام تعیین می‌کند؛
          پیامک تضمین‌شده نیست.
        </p>
      </article>
      <ThemePicker />
    </section>
  );
}
