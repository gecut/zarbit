import { Button } from "@heroui/react";
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
        operation={connection.operation}
        retryWait={connection.retryWait}
        isLoading={connection.isLoading}
        isPending={connection.isPending}
        loadError={connection.loadError}
        loginForm={
          connection.shouldShowLoginForm && connection.session ? (
            <TelegramLoginForm
              isPending={connection.isPending}
              isAdmitting={connection.isAdmitting}
              capabilities={connection.session.capabilities}
              fieldIssue={connection.fieldIssue}
              retryWait={connection.retryWait}
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
          ) : connection.session?.capabilities.canCancelLogin &&
            connection.session.challengeId ? (
            <Button
              variant="secondary"
              isDisabled={connection.isAdmitting}
              onPress={() =>
                connection.cancelLogin(connection.session!.challengeId!)
              }
            >
              لغو ورود
            </Button>
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
