import { Button, Input, InputOTP, Label, TextField } from "@heroui/react";
import { normalizeDigits, type LoginStatus } from "@zarbit/contracts";

const deliveryLabels: Record<string, string> = {
  app: "پیام تلگرام",
  sms: "پیامک",
  call: "تماس تلفنی",
  sms_word: "پیامک",
  sms_phrase: "پیامک",
};

type TelegramLoginFormProps = {
  isPending: boolean;
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
  login: LoginStatus;
  onSecretChange: (secret: string) => void;
  secret: string;
};

function LoginCredentialField({
  isDisabled,
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
      <div>
        <Label id="otp-label">کد ورود</Label>
        <div dir="ltr" className="mx-auto w-min">
          <InputOTP
            aria-labelledby="otp-label"
            variant="secondary"
            textAlign="center"
            isDisabled={isDisabled}
            maxLength={otpLength}
            onChange={(value) => onSecretChange(normalizeDigits(value))}
            value={secret}
          >
            <InputOTP.Group>
              {Array.from({ length: otpLength }, (_, index) => (
                <InputOTP.Slot index={index} key={index} />
              ))}
            </InputOTP.Group>
          </InputOTP>
        </div>
      </div>
    );
  }

  const isPassword = login.step === "PASSWORD";

  return (
    <TextField
      isDisabled={isDisabled}
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
    </TextField>
  );
}

export function TelegramLoginForm({
  isPending,
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
  const isVerifying = login?.step === "VERIFYING";
  const isCredentialDisabled = isPending || remaining === 0;
  const isSubmitDisabled = login
    ? !secret || !remaining || isVerifying
    : !phone;
  const submitLabel = !login
    ? "ارسال کد ورود"
    : login.step === "PASSWORD"
      ? "تأیید رمز دوم"
      : "تأیید کد";

  return (
    <form
      className="my-5 grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {!login ? (
        <TextField
          isDisabled={isPending}
          isRequired
          name="phone"
          onChange={onPhoneChange}
          type="tel"
          value={phone}
          variant="secondary"
        >
          <Label>شماره تلفن با کد کشور</Label>
          <Input autoComplete="tel" dir="ltr" placeholder="+989121234567" />
        </TextField>
      ) : (
        <>
          <p>
            حساب <bdi>{login.maskedPhone}</bdi> —{" "}
            {login.step === "PASSWORD"
              ? "رمز دوم تلگرام لازم است."
              : `کد از طریق ${deliveryLabels[login.delivery] ?? "تلگرام"} ارسال شده است.`}
          </p>
          <p className="text-muted mt-1 text-xs leading-6">
            زمان باقی‌مانده: {remaining} ثانیه
          </p>
          {isVerifying ? (
            <p role="status">در حال بررسی حساب و عضویت…</p>
          ) : (
            <LoginCredentialField
              isDisabled={isCredentialDisabled}
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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-[0.55rem]">
          <Button
            isDisabled={isPending}
            onPress={() => onCancel(login.id)}
            variant="secondary"
          >
            لغو / تغییر شماره
          </Button>
          {login.step === "CODE" ? (
            <Button
              isDisabled={isPending || resendWait !== 0 || !remaining}
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
