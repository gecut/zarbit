import {
  AppError,
  normalizeDigits,
  sessionCommandSchema,
  isTelegramOperationPending,
  type TelegramIssue,
  type WorkerCommand,
} from "@zarbit/contracts";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shared/api/api-context";
import { useIdentity } from "../../shared/auth/auth";
import { resolveTelegramSessionPresentation } from "./_session-view-model";
import {
  useSessionCommand,
  useTelegramSession,
  useTelegramOperation,
} from "./_use-telegram-session";

type SessionCommand = Exclude<WorkerCommand, { type: "status" | "force-send" }>;
function secondsUntil(
  value: string | null | undefined,
  now: number,
): number | null {
  return value
    ? Math.max(0, Math.ceil((Date.parse(value) - now) / 1000))
    : null;
}
export function useTelegramConnection() {
  const query = useTelegramSession();
  const mutation = useSessionCommand();
  const client = useQueryClient();
  const api = useApi(useIdentity().telegramUserId);
  const [phone, setPhone] = useState("");
  const [secret, setSecret] = useState("");
  const [localIssue, setLocalIssue] = useState<TelegramIssue | null>(null);
  const [submitted, setSubmitted] = useState<{ id: string; at: number } | null>(
    null,
  );
  const [now, setNow] = useState(Date.now);
  const running = useRef(false);
  const session = query.data;
  const operationId =
    session?.activeOperationId && session.activeOperationId !== submitted?.id
      ? session.activeOperationId
      : (submitted?.id ?? session?.activeOperationId ?? null);
  const reconcile = !!submitted && now - submitted.at < 10_000;
  const operationQuery = useTelegramOperation(operationId, reconcile);
  const operation = operationQuery.data;
  const login = session?.login;
  const presentation = session
    ? resolveTelegramSessionPresentation(session)
    : null;
  const pendingOperation = !!operation && isTelegramOperationPending(operation);
  const isPending =
    mutation.isPending ||
    pendingOperation ||
    !!session?.activeOperationId ||
    (!operation && reconcile);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!operation || isTelegramOperationPending(operation)) return;
    void client.invalidateQueries({ queryKey: api.telegram.status.key() });
    void client.invalidateQueries({ queryKey: api.requests.key() });
  }, [operation, client, api]);

  useEffect(() => {
    setSecret("");
  }, [login?.id, login?.step]);
  const runCommand = async (command: SessionCommand): Promise<boolean> => {
    const stopping = command.type === "cancel" || command.type === "revoke";
    if (running.current || (isPending && !stopping)) return false;
    const parsed = sessionCommandSchema.safeParse(command);
    if (!parsed.success) {
      const field =
        command.type === "login"
          ? "phone"
          : command.type === "password"
            ? "password"
            : "code";
      setLocalIssue({
        code: "INVALID_INPUT",
        field,
        message:
          field === "phone"
            ? "شماره را با کد کشور وارد کنید؛ مثلاً +989121234567."
            : "اطلاعات این بخش را بررسی کنید.",
      });
      return false;
    }
    const id = crypto.randomUUID();
    running.current = true;
    setLocalIssue(null);
    setSubmitted({ id, at: Date.now() });
    setSecret("");
    try {
      await mutation.mutateAsync({ operationId: id, command: parsed.data });
      if (command.type === "login") setPhone("");
      return true;
    } catch (error) {
      setLocalIssue(
        error instanceof AppError
          ? {
              code: error.code,
              message: error.message,
              retryAt: error.retryAt,
              field: error.details?.field,
              requestId: error.details?.requestId,
            }
          : {
              code: "NETWORK",
              message: "ثبت عملیات تأیید نشد؛ نتیجه را دوباره بررسی کنید.",
            },
      );
      // Observation reconciles a lost receipt. Never replay credentials automatically.
      return false;
    } finally {
      running.current = false;
      mutation.reset();
    }
  };
  const submitLogin = (): void => {
    if (!session) return;
    const command: SessionCommand = !login
      ? { type: "login", phone }
      : login.step === "PASSWORD"
        ? { type: "password", id: login.id, password: secret }
        : { type: "code", id: login.id, code: normalizeDigits(secret) };
    void runCommand(command);
  };
  const issue =
    localIssue?.code === "INVALID_INPUT"
      ? localIssue
      : (operation?.issue ?? (operation ? null : localIssue));
  const fieldVisible =
    issue?.field &&
    (issue.field === "phone"
      ? !login && presentation?.canStartLogin
      : issue.field === "password"
        ? login?.step === "PASSWORD"
        : login?.step === "CODE");
  return {
    cancelLogin: (id: string): void => {
      void runCommand({ type: "cancel", id });
    },
    checkMembership: (): void => {
      void runCommand({ type: "membership" });
    },
    commandError: !fieldVisible ? issue?.message : null,
    fieldIssue: fieldVisible ? issue : null,
    operation,
    isPending,
    isAdmitting: mutation.isPending,
    isLoading: query.isPending,
    isUnavailable: presentation?.isUnavailable ?? false,
    loadError: query.error?.message ?? operationQuery.error?.message,
    login,
    phone,
    secret,
    session,
    setPhone,
    setSecret,
    remaining: secondsUntil(login?.expiresAt, now) ?? 0,
    resendWait: secondsUntil(login?.resendAvailableAt, now),
    retryWait:
      secondsUntil(issue?.retryAt ?? login?.retryAt ?? session?.retryAt, now) ??
      0,
    resendLogin: (id: string): void => {
      void runCommand({ type: "resend", id });
    },
    retryStatus: (): void => {
      void query.refetch();
      void operationQuery.refetch();
    },
    revokeConnection: async (): Promise<void> => {
      if (!(await runCommand({ type: "revoke" })))
        throw new Error("ثبت قطع اتصال تأیید نشد؛ وضعیت عملیات را بررسی کنید.");
    },
    shouldShowLoginForm: Boolean(login) || presentation?.canStartLogin === true,
    submitLogin,
  };
}
