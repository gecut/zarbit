import { normalizeDigits } from "@zarbit/contracts";
import { useEffect, useState } from "react";

import { useSessionCommand, useTelegramSession } from "../lib/telegram-session";
import { ThemePicker } from "../lib/theme";
import { TelegramConnectionCard } from "./telegram/telegram-connection-card";
import { TelegramLoginForm } from "./telegram/telegram-login-form";
import type { SessionCommand } from "./telegram/telegram-types";

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

  const run = async (command: SessionCommand) => {
    setError(null);
    try {
      await mutation.mutateAsync(command);
      setSecret("");
      if (command.type === "login") setPhone("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "عملیات انجام نشد.");
      throw cause;
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
    const command: SessionCommand = !login
      ? { type: "login", phone }
      : login.step === "PASSWORD"
        ? { type: "password", id: login.id, password: secret }
        : { type: "code", id: login.id, code: normalizeDigits(secret) };
    void run(command).catch(() => undefined);
  };

  return (
    <section className="grid gap-[1.05rem]">
      <TelegramConnectionCard
        error={error ?? login?.error}
        isLoading={query.isPending}
        isPending={mutation.isPending}
        loadError={query.error?.message}
        onRetry={() => void query.refetch()}
        onRun={run}
        session={session}
      >
        {mayLogin || login ? (
          <TelegramLoginForm
            isPending={mutation.isPending}
            login={login}
            onCancel={(loginId) => {
              void run({ type: "cancel", id: loginId }).catch(() => undefined);
            }}
            onPhoneChange={setPhone}
            onResend={(loginId) => {
              void run({ type: "resend", id: loginId }).catch(() => undefined);
            }}
            onSecretChange={setSecret}
            onSubmit={submit}
            phone={phone}
            remaining={remaining}
            resendWait={resendWait}
            secret={secret}
          />
        ) : null}
      </TelegramConnectionCard>
      <ThemePicker />
    </section>
  );
}
