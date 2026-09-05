import { ClipboardListIcon } from "@solar-icons/react/linear/clipboard-list";
import { HistoryIcon } from "@solar-icons/react/linear/history";
import { HomeIcon } from "@solar-icons/react/linear/home";
import { SettingsMinimalisticIcon } from "@solar-icons/react/linear/settings-minimalistic";
import { Link, Outlet } from "@tanstack/react-router";

import { AuthGate } from "../lib/auth";
import { PwaUpdate } from "./pwa-update";

const navigationItems = [
  { label: "خانه", to: "/", Icon: HomeIcon },
  { label: "فعال", to: "/requests/active", Icon: ClipboardListIcon },
  { label: "سوابق", to: "/requests/history", Icon: HistoryIcon },
  { label: "تلگرام", to: "/telegram", Icon: SettingsMinimalisticIcon },
] as const;

const navigationItemClass =
  "grid min-h-14 place-content-center gap-0.5 rounded-xl text-center text-xs font-semibold text-muted transition-[color,background] duration-150 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-3";

export function AppShell() {
  return (
    <main className="min-h-(--tg-viewport-height,100svh) px-4 pt-[max(1rem,env(safe-area-inset-top),var(--tg-safe-top,0px))] pb-[calc(6.65rem+max(env(safe-area-inset-bottom),var(--tg-safe-bottom,0px)))] sm:px-6">
      <header className="w-full fixed inset-x-0 top-0 p-6 bg-background/50 z-50 backdrop-blur-3xl">
        <nav className="flex w-full max-w-124 mx-auto items-center justify-between gap-4">
          <Link
          to="/"
          aria-label="صفحه اصلی زربیت"
          className="inline-flex min-w-0 items-center gap-3"
        >
          <span className="grid size-[2.7rem] shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-hover))] text-xl font-extrabold text-accent-foreground shadow-surface">
            ز
          </span>
          <span>
            <span className="block text-base leading-[1.35] font-semibold text-foreground">
              زربیت
            </span>
            <span className="mt-px block text-xs text-muted">
              دستیار معامله شما
            </span>
          </span>
        </Link>

        <Link
          to="/telegram"
          aria-label="تنظیمات اتصال تلگرام"
          className="inline-flex size-[2.65rem] items-center justify-center rounded-2xl border border-border bg-surface text-muted shadow-surface focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-3"
        >
          <SettingsMinimalisticIcon size={21} />
        </Link>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-124 min-w-0 pt-24">
        <AuthGate>
          <Outlet />
        </AuthGate>
        <PwaUpdate />
      </div>

      <nav
        className="fixed inset-x-3 bottom-[max(0.65rem,env(safe-area-inset-bottom),var(--tg-safe-bottom,0px))] z-20 mx-auto grid max-w-124 grid-cols-4 rounded-2xl border border-border bg-surface p-1 shadow-surface backdrop-blur-[15px]"
        aria-label="ناوبری اصلی"
      >
        {navigationItems.map(({ label, to, Icon }) => (
          <Link
            key={to}
            to={to}
            className={navigationItemClass}
            activeProps={{
              className: `${navigationItemClass} bg-accent-soft text-accent-soft-foreground`,
            }}
          >
            <Icon size={20} className="mx-auto mb-1" />

            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
