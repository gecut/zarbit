import {
  HeadContent,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import {Fragment} from 'react'

import "../index.css";
import { AppShell } from "../components/app-shell";

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
    <Fragment>
      <HeadContent />
      <AppShell />
    </Fragment>
  );
}
