import {
  Button,
  FieldError,
  Input,
  InputOTP,
  Label,
  ProgressCircle,
  TextField,
} from "@heroui/react";
import {
  normalizeDigits,
  type LoginStatus,
  type SessionCapabilities,
  type TelegramIssue,
} from "@zarbit/contracts";

const deliveryLabels: Record<string, string> = {
  app: "پیام تلگرام",
  call: "تماس تلفنی",
  sms: "پیامک",
  sms_phrase: "پیامک",
  sms_word: "پیامک",
};

type TelegramLoginFormProps = {
  isPending: boolean;
  isAdmitting: boolean;
  capabilities: SessionCapabilities;
  fieldIssue?: TelegramIssue | null;
  retryWait: number;
  isUnavailable: boolean;
  login: LoginStatus | null | undefined;
  onCancel: (loginId: string) => void;
  onPhoneChange: (phone: string) => void;
  onResend: (loginId: string) => void;
  onSecretChange: (secret: string) => void;
  onSubmit: () => void;
  phone: string;
  remaining: number;
  resendWait: number | null;
  secret: string;
};

type LoginCredentialFieldProps = {
  isDisabled: boolean;
  error?: string;
  login: LoginStatus;
  onSecretChange: (secret: string) => void;
  secret: string;
};

function LoginCredentialField({
  isDisabled,
  error,
  login,
  onSecretChange,
  secret,
}: LoginCredentialFieldProps) {
  const otpLength =
    login.step === "CODE" &&
    login.codeLength !== null &&
    login.codeLength > 0 &&
    login.codeLength <= 10
      ? login.codeLength
      : null;

  if (otpLength !== null) {
    return (
      <div className="grid gap-3">
        <div>
          <Label id="otp-label">کد ورود</Label>
          <p className="text-muted mt-1 text-xs leading-6">
            کد را دقیقاً به همان ترتیبی که تلگرام ارسال کرده وارد کنید.
          </p>
        </div>
        <div className="mx-auto w-min" dir="ltr">
          <InputOTP
            aria-labelledby="otp-label"
            aria-invalid={!!error}
            aria-describedby={error ? "otp-error" : undefined}
            inputMode="numeric"
            isDisabled={isDisabled}
            maxLength={otpLength}
            onChange={(value) => onSecretChange(normalizeDigits(value))}
            textAlign="center"
            value={secret}
            variant="secondary"
          >
            <InputOTP.Group>
              {Array.from({ length: otpLength }, (_, index) => (
                <InputOTP.Slot index={index} key={index} />
              ))}
            </InputOTP.Group>
          </InputOTP>
        </div>
        {error ? (
          <p id="otp-error" role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const isPassword = login.step === "PASSWORD";

  return (
    <TextField
      isDisabled={isDisabled}
      isInvalid={!!error}
      isRequired
      name={isPassword ? "password" : "code"}
      onChange={onSecretChange}
      type={isPassword ? "password" : "text"}
      value={secret}
    >
      <Label>{isPassword ? "رمز دوم تلگرام" : "کد ورود"}</Label>
      <Input
        autoComplete={isPassword ? "off" : "one-time-code"}
        dir="ltr"
        maxLength={1024}
      />
      {error ? <FieldError>{error}</FieldError> : null}
      {isPassword ? (
        <p className="text-muted mt-2 text-xs leading-6">
          رمز دوم فقط برای ورود به تلگرام استفاده می‌شود و ذخیره نمی‌شود.
        </p>
      ) : null}
    </TextField>
  );
}

export function TelegramLoginForm({
  isPending,
  isAdmitting,
  capabilities,
  fieldIssue,
  retryWait,
  isUnavailable,
  login,
  onCancel,
  onPhoneChange,
  onResend,
  onSecretChange,
  onSubmit,
  phone,
  remaining,
  resendWait,
  secret,
}: TelegramLoginFormProps) {
  const isVerifying = !!login && !["CODE", "PASSWORD"].includes(login.step);
  const isCredentialDisabled =
    isPending ||
    isUnavailable ||
    remaining === 0 ||
    isVerifying ||
    retryWait > 0;
  const isSubmitDisabled = login
    ? isPending ||
      isUnavailable ||
      !secret ||
      !remaining ||
      isVerifying ||
      retryWait > 0 ||
      (login.step === "PASSWORD"
        ? !capabilities.canSubmitPassword
        : !capabilities.canSubmitCode)
    : isPending ||
      isUnavailable ||
      !phone ||
      !capabilities.canLogin ||
      retryWait > 0;
  const submitLabel = !login
    ? "ارسال کد ورود"
    : login.step === "PASSWORD"
      ? "تأیید رمز دوم"
      : "تأیید کد";

  return (
    <form
      noValidate
      className="border-separator mt-6 grid gap-5 border-t pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (isSubmitDisabled) return;
        onSubmit();
      }}
    >
      {!login ? (
        <>
          <div>
            <h2 className="text-foreground text-base font-semibold">
              اتصال حساب
            </h2>
            <p className="text-muted mt-1 text-sm leading-7">
              شماره تلفنی را وارد کنید که عضو گروه هدف است.
            </p>
          </div>
          <TextField
            isDisabled={isPending || isUnavailable}
            isInvalid={fieldIssue?.field === "phone"}
            isRequired
            name="phone"
            onChange={onPhoneChange}
            type="tel"
            value={phone}
            variant="secondary"
          >
            <Label>شماره تلفن با کد کشور</Label>
            <Input
              autoComplete="tel"
              dir="ltr"
              inputMode="tel"
              placeholder="+989121234567"
            />
            {fieldIssue?.field === "phone" ? (
              <FieldError>{fieldIssue.message}</FieldError>
            ) : null}
          </TextField>
          <p className="text-muted text-xs leading-6">
            کد ورود را در چت بات نفرستید. محل دریافت کد را تلگرام تعیین می‌کند.
          </p>
        </>
      ) : (
        <>
          <div className="border-border bg-surface-secondary grid gap-1 rounded-xl border px-4 py-3">
            <p className="text-foreground text-sm font-semibold">
              حساب <bdi dir="ltr">{login.maskedPhone}</bdi>
            </p>
            <p className="text-muted text-xs leading-6">
              {login.step === "PASSWORD"
                ? "رمز دوم تلگرام لازم است."
                : `کد از طریق ${deliveryLabels[login.delivery] ?? "تلگرام"} ارسال شده است.`}
            </p>
            <p
              aria-atomic="true"
              aria-live="polite"
              className="text-muted text-xs leading-6"
            >
              زمان باقی‌مانده: {remaining} ثانیه
            </p>
          </div>
          {isVerifying ? (
            <div
              className="border-border bg-surface-secondary flex items-center gap-3 rounded-xl border px-4 py-4"
              role="status"
            >
              <ProgressCircle
                aria-label="در حال انجام مرحله ورود"
                color="accent"
                isIndeterminate
                size="sm"
              />
              <div>
                <p className="text-foreground text-sm font-semibold">
                  در حال انجام مرحله ورود
                </p>
                <p className="text-muted mt-1 text-xs leading-6">
                  تا پایان بررسی، اقدام دیگری انجام ندهید.
                </p>
              </div>
            </div>
          ) : (
            <LoginCredentialField
              isDisabled={isCredentialDisabled}
              error={
                fieldIssue?.field !== "phone" ? fieldIssue?.message : undefined
              }
              login={login}
              onSecretChange={onSecretChange}
              secret={secret}
            />
          )}
        </>
      )}

      <Button
        fullWidth
        isDisabled={isSubmitDisabled}
        isPending={isPending}
        type="submit"
      >
        {submitLabel}
      </Button>

      {login ? (
        <div className="flex flex-wrap items-center justify-between gap-[0.55rem]">
          <Button
            isDisabled={isAdmitting || !capabilities.canCancelLogin}
            onPress={() => onCancel(login.id)}
            variant="secondary"
          >
            لغو / تغییر شماره
          </Button>
          {login.step === "CODE" ? (
            <Button
              isDisabled={
                isPending ||
                isUnavailable ||
                isVerifying ||
                !capabilities.canResend ||
                retryWait > 0 ||
                resendWait !== 0 ||
                !remaining
              }
              onPress={() => onResend(login.id)}
              variant="secondary"
            >
              {resendWait ? `ارسال مجدد (${resendWait})` : "ارسال دوباره کد"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
