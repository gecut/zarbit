import { HomeIcon } from "@solar-icons/react/linear/home";
import { HomeIcon as HomeBoldIcon } from "@solar-icons/react/bold/home";
import { SettingsMinimalisticIcon } from "@solar-icons/react/linear/settings-minimalistic";
import { SettingsMinimalisticIcon as SettingsMinimalisticBoldIcon } from "@solar-icons/react/bold/settings-minimalistic";
import { HistoryIcon } from "@solar-icons/react/linear/history";
import { Link, Outlet } from "@tanstack/react-router";

import { AuthGate } from "../lib/auth";
import { PwaUpdate } from "./pwa-update";

const navigationItems = [
  { label: "خانه", to: "/", Icon: HomeIcon, ActiveIcon: HomeBoldIcon },
  {
    label: "سوابق",
    to: "/history",
    Icon: HistoryIcon,
    ActiveIcon: HistoryIcon,
  },
  {
    label: "تنظیمات",
    to: "/telegram",
    Icon: SettingsMinimalisticIcon,
    ActiveIcon: SettingsMinimalisticBoldIcon,
  },
] as const;

const navigationItemClass =
  "grid min-h-14 group place-content-center gap-1 rounded-3xl text-center text-xs font-semibold text-muted transition-[color,background] duration-150 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-3";

export function AppShell() {
  return (
    <main className="min-h-(--tg-viewport-height,100svh) px-4 pb-[calc(6.65rem+max(env(safe-area-inset-bottom),var(--tg-safe-bottom,0px)))] pt-[max(1rem,env(safe-area-inset-top),var(--tg-safe-top,0px))] sm:px-6">
      <header className="bg-background/50 fixed inset-x-0 top-0 z-50 w-full p-6 backdrop-blur-xl">
        <nav className="max-w-124 mx-auto flex w-full items-center justify-between gap-4">
          <Link
            to="/"
            aria-label="صفحه اصلی زربیت"
            className="inline-flex min-w-0 items-center gap-3"
          >
            <span className="text-accent-foreground shadow-surface grid size-[2.7rem] shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-hover))] text-xl font-extrabold">
              ز
            </span>
            <span>
              <span className="text-foreground block text-base font-semibold leading-[1.35]">
                زربیت
              </span>
              <span className="text-muted mt-px block text-xs">
                نمایش آخرین مظنه
              </span>
            </span>
          </Link>

          <Link
            to="/telegram"
            aria-label="تنظیمات اتصال تلگرام"
            className="border-border bg-surface text-muted shadow-surface focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-3 inline-flex size-[2.65rem] items-center justify-center rounded-2xl border"
          >
            <SettingsMinimalisticIcon size={21} />
          </Link>
        </nav>
      </header>

      <div className="max-w-124 mx-auto w-full min-w-0 pt-20">
        <PwaUpdate />

        <AuthGate>
          <Outlet />
        </AuthGate>
      </div>

      <nav
        className="max-w-124 border-border bg-surface/80 shadow-surface rounded-4xl fixed inset-x-3 bottom-[max(0.65rem,env(safe-area-inset-bottom),var(--tg-safe-bottom,0px))] z-20 mx-auto grid grid-cols-3 border p-1 backdrop-blur-sm"
        aria-label="ناوبری اصلی"
      >
        {navigationItems.map(({ label, to, Icon, ActiveIcon }) => (
          <Link
            key={to}
            to={to}
            className={navigationItemClass}
            activeProps={{
              className: `${navigationItemClass} bg-accent-soft text-accent-soft-foreground!`,
            }}
          >
            <div className="relative flex h-6 w-full min-w-6 items-center justify-center">
              <Icon className="group-data-status:opacity-0 absolute size-6 opacity-100 transition-opacity" />
              <ActiveIcon className="group-data-status:opacity-100 absolute size-6 opacity-0 transition-opacity" />
            </div>

            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
