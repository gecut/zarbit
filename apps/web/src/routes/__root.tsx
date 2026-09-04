import { Button } from "@heroui/react";
import { HeadContent, Link, Outlet, createRootRouteWithContext, useNavigate } from "@tanstack/react-router";

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
  const navigate = useNavigate();
  return (
    <main className="app-shell">
      <HeadContent />
      <header className="app-header"><Link to="/" className="text-lg font-bold">زربیت</Link><span className="text-xs text-muted">مدیریت مظنه</span></header>
      <div className="app-content"><Outlet /></div>
      <nav className="app-nav" aria-label="ناوبری اصلی">
        <Button variant="ghost" size="sm" onPress={() => navigate({ to: "/" })}>خانه</Button>
        <Button variant="ghost" size="sm" onPress={() => navigate({ to: "/requests/active" })}>فعال</Button>
        <Button variant="ghost" size="sm" onPress={() => navigate({ to: "/requests/history" })}>سوابق</Button>
        <Button variant="ghost" size="sm" onPress={() => navigate({ to: "/telegram" })}>تلگرام</Button>
      </nav>
    </main>
  );
}
