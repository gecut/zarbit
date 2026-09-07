import {
  HeadContent,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { Fragment } from "react";

import "../index.css";
import { AppShell } from "../components/app-shell";

export type RouterAppContext = Record<string, never>;

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "زربیت",
      },
      {
        name: "description",
        content: "نمایش آخرین مظنه زربیت",
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
