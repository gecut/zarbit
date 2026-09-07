import { TelegramLoginForm } from "./_telegram-login-form";
import { TelegramSessionPanel } from "./_telegram-session-panel";
import { ThemePicker } from "./_theme-picker";
import { useTelegramConnection } from "./_use-telegram-connection";

export function TelegramPage() {
  const connection = useTelegramConnection();

  return (
    <section className="grid gap-[1.05rem]">
      <TelegramSessionPanel
        commandError={connection.commandError}
        isLoading={connection.isLoading}
        isPending={connection.isPending}
        loadError={connection.loadError}
        loginForm={
          connection.shouldShowLoginForm ? (
            <TelegramLoginForm
              isPending={connection.isPending}
              isUnavailable={connection.isUnavailable}
              login={connection.login}
              onCancel={connection.cancelLogin}
              onPhoneChange={connection.setPhone}
              onResend={connection.resendLogin}
              onSecretChange={connection.setSecret}
              onSubmit={connection.submitLogin}
              phone={connection.phone}
              remaining={connection.remaining}
              resendWait={connection.resendWait}
              secret={connection.secret}
            />
          ) : undefined
        }
        onCheckMembership={connection.checkMembership}
        onRetry={connection.retryStatus}
        onRevoke={connection.revokeConnection}
        session={connection.session}
      />

      <ThemePicker />
    </section>
  );
}
