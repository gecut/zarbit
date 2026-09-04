import { ClipboardListIcon } from "@solar-icons/react/linear/clipboard-list";
import { HistoryIcon } from "@solar-icons/react/linear/history";
import { HomeIcon } from "@solar-icons/react/linear/home";
import { SettingsMinimalisticIcon } from "@solar-icons/react/linear/settings-minimalistic";
import { HeadContent, Link, Outlet, createRootRouteWithContext } from "@tanstack/react-router";

import "../index.css";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "زربیت",
      },
      {
        name: "description",
        content: "مدیریت درخواست‌های مظنه زربیت",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  return (
    <main className="app-shell">
      <HeadContent />
      <header className="app-header">
        <Link to="/" className="brand" aria-label="صفحه اصلی زربیت">
          <span className="brand__mark" aria-hidden="true">ز</span>
          <span><span className="brand__name">زربیت</span><span className="brand__caption">دستیار معامله شما</span></span>
        </Link>
        <Link to="/telegram" className="header-link" aria-label="تنظیمات اتصال تلگرام"><SettingsMinimalisticIcon size={21} /></Link>
      </header>
      <div className="app-content"><Outlet /></div>
      <nav className="app-nav" aria-label="ناوبری اصلی">
        <Link to="/" className="app-nav__item" activeProps={{ className: "app-nav__item is-active" }}><HomeIcon size={20} /><span>خانه</span></Link>
        <Link to="/requests/active" className="app-nav__item" activeProps={{ className: "app-nav__item is-active" }}><ClipboardListIcon size={20} /><span>فعال</span></Link>
        <Link to="/requests/history" className="app-nav__item" activeProps={{ className: "app-nav__item is-active" }}><HistoryIcon size={20} /><span>سوابق</span></Link>
        <Link to="/telegram" className="app-nav__item" activeProps={{ className: "app-nav__item is-active" }}><SettingsMinimalisticIcon size={20} /><span>تلگرام</span></Link>
      </nav>
    </main>
  );
}
