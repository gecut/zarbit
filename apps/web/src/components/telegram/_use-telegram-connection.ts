import { normalizeDigits, type WorkerCommand } from "@zarbit/contracts";
import { useEffect, useRef, useState } from "react";

import {
  useSessionCommand,
  useTelegramSession,
} from "../../lib/telegram-session";
import { resolveTelegramSessionPresentation } from "./_session-view-model";

type SessionCommand = Exclude<WorkerCommand, { type: "status" }>;

function secondsUntil(
  value: string | null | undefined,
  now: number,
): number | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 0;

  return Math.max(0, Math.ceil((timestamp - now) / 1000));
}

export function useTelegramConnection() {
  const query = useTelegramSession();
  const mutation = useSessionCommand();
  const [phone, setPhone] = useState("");
  const [secret, setSecret] = useState("");
  const [commandError, setCommandError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const isCommandRunningRef = useRef(false);
  const session = query.data;
  const login = session?.login;
  const presentation = session
    ? resolveTelegramSessionPresentation(session)
    : null;

  useEffect(() => {
    if (!login?.id) return;

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [login?.id]);

  useEffect(() => {
    setSecret("");
    setCommandError(null);
  }, [login?.id, login?.step]);

  const runCommand = async (command: SessionCommand): Promise<void> => {
    if (
      session?.connection === "OFFLINE" ||
      mutation.isPending ||
      isCommandRunningRef.current
    ) {
      return;
    }

    isCommandRunningRef.current = true;
    setCommandError(null);

    try {
      await mutation.mutateAsync(command);
      setSecret("");
      if (command.type === "login") setPhone("");
    } catch (cause) {
      setCommandError(
        cause instanceof Error ? cause.message : "عملیات انجام نشد.",
      );
      throw cause;
    } finally {
      isCommandRunningRef.current = false;
      mutation.reset();
    }
  };

  const ignoreCommandFailure = (command: SessionCommand): void => {
    void runCommand(command).catch(() => undefined);
  };

  const submitLogin = (): void => {
    if (mutation.isPending || session?.connection === "OFFLINE") return;

    const command: SessionCommand = !login
      ? { type: "login", phone }
      : login.step === "PASSWORD"
        ? { type: "password", id: login.id, password: secret }
        : { type: "code", id: login.id, code: normalizeDigits(secret) };

    ignoreCommandFailure(command);
  };

  return {
    cancelLogin: (loginId: string): void =>
      ignoreCommandFailure({ type: "cancel", id: loginId }),
    checkMembership: (): void => ignoreCommandFailure({ type: "membership" }),
    commandError: commandError ?? login?.error,
    isLoading: query.isPending,
    isPending: mutation.isPending,
    isUnavailable: presentation?.isUnavailable ?? false,
    loadError: query.error?.message,
    login,
    phone,
    remaining: secondsUntil(login?.expiresAt, now) ?? 0,
    resendLogin: (loginId: string): void =>
      ignoreCommandFailure({ type: "resend", id: loginId }),
    resendWait: secondsUntil(login?.resendAvailableAt, now),
    retryStatus: (): void => {
      void query.refetch();
    },
    revokeConnection: (): Promise<void> => runCommand({ type: "revoke" }),
    secret,
    session,
    setPhone,
    setSecret,
    shouldShowLoginForm: Boolean(login) || presentation?.canStartLogin === true,
    submitLogin,
  };
}
