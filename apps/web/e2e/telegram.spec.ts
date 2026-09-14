import { expect, test } from "@playwright/test";
import { sessionFixture, loginFixture } from "../test/telegram-fixture";
import {
  presentTelegramSession,
  type TelegramOperation,
  type TelegramSessionFacts,
} from "@zarbit/contracts";

test("mobile RTL login: field errors, 2FA, clear secrets, and restored disconnect", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let facts: TelegramSessionFacts = {
    ...sessionFixture({
      authorization: "DISCONNECTED",
      connectedTelegramUserId: null,
      connection: "OFFLINE",
      membership: "UNKNOWN",
    }),
  };
  // Keep only contract facts; capabilities are produced by the presenter.
  const initial = sessionFixture({
    authorization: "DISCONNECTED",
    connectedTelegramUserId: null,
    connection: "OFFLINE",
    membership: "UNKNOWN",
  });
  const { capabilities: _capabilities, ...initialFacts } = initial;
  facts = initialFacts;
  const operations = new Map<string, TelegramOperation>();
  let commands = 0;
  await page.route("https://api.example.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() as {
      json?: Record<string, unknown>;
    } | null;
    const query = new URL(route.request().url()).searchParams.get("data");
    const input = body?.json ?? (query ? JSON.parse(query).json : {});
    let result: unknown = null;
    if (path.endsWith("/auth/identity")) result = { telegramUserId: "101" };
    if (path.endsWith("/telegram/status"))
      result = presentTelegramSession(facts);
    if (path.endsWith("/telegram/operation"))
      result = operations.get(String(input.id)) ?? null;
    if (path.endsWith("/telegram/command")) {
      commands++;
      const command = input.command as {
        type: string;
        id?: string;
        code?: string;
        password?: string;
      };
      const operationId = String(input.operationId);
      const at = new Date().toISOString();
      let issue: TelegramOperation["issue"] = null;
      if (command.type === "login")
        facts = {
          ...facts,
          authorization: "LOGIN_PENDING",
          challengeId: operationId,
          login: {
            ...loginFixture("CODE"),
            id: operationId,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            resendAvailableAt: at,
          },
        };
      if (command.type === "code" && facts.login) {
        if (command.code !== "12345")
          issue = {
            code: "PHONE_CODE_INVALID",
            field: "code",
            message: "کد واردشده درست نیست.",
          };
        else facts = { ...facts, login: { ...facts.login, step: "PASSWORD" } };
      }
      if (command.type === "password")
        facts = {
          ...facts,
          authorization: "AUTHORIZED",
          login: null,
          challengeId: null,
          connectedTelegramUserId: "101",
          connection: "CONNECTED",
          membership: "MEMBER",
        };
      if (command.type === "revoke")
        facts = {
          ...facts,
          authorization: "REVOKED",
          connectedTelegramUserId: null,
          connection: "OFFLINE",
          membership: "UNKNOWN",
        };
      facts.version++;
      operations.set(operationId, {
        operationId,
        type: command.type as TelegramOperation["type"],
        status: issue ? "FAILED" : "SUCCEEDED",
        revision: 1,
        challengeId: command.id ?? null,
        requestId: operationId,
        acceptedAt: at,
        completedAt: at,
        issue,
        cancelledRequests: command.type === "revoke" ? 2 : 0,
        sendingRequests: command.type === "revoke" ? 1 : 0,
      });
      result = { operationId, acceptedAt: at };
    }
    await route.fulfill({ json: { json: result } });
  });
  await page.goto("/e2e/harness.html?telegram");
  const phone = page.getByLabel("شماره تلفن با کد کشور");
  await phone.fill("123");
  await page.getByRole("button", { name: "ارسال کد ورود" }).click();
  await expect(
    page.getByText("شماره را با کد کشور وارد کنید؛ مثلاً +989121234567."),
  ).toBeVisible();
  expect(commands).toBe(0);
  await phone.fill("+989121234567");
  await page.getByRole("button", { name: "ارسال کد ورود" }).click();
  const otp = page.locator('input[autocomplete="one-time-code"]');
  await expect(otp).toBeEnabled();
  await otp.fill("00000");
  await page.getByRole("button", { name: "تأیید کد", exact: true }).click();
  await expect(
    page.getByText("کد واردشده درست نیست.", { exact: true }),
  ).toHaveCount(1);
  await expect(otp).toHaveValue("");
  await otp.fill("12345");
  await page.getByRole("button", { name: "تأیید کد", exact: true }).click();
  const password = page.getByLabel("رمز دوم تلگرام", { exact: true });
  await expect(password).toBeEnabled();
  await password.fill("test-password");
  await page.getByRole("button", { name: "تأیید رمز دوم" }).click();
  await expect(
    page.getByRole("button", { name: "قطع اتصال تلگرام", exact: true }),
  ).toBeVisible();
  await expect(password).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).join("").includes("test-password"),
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/telegram-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "قطع اتصال تلگرام", exact: true })
    .click();
  await page.getByRole("button", { name: "تأیید قطع اتصال تلگرام" }).click();
  await expect(
    page.getByText("2 درخواست ارسال‌نشده لغو شد.", { exact: false }),
  ).toBeVisible();
  await expect(phone).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});

test("worker outage preserves account and allows disconnect", async ({
  page,
}) => {
  await page.route("https://api.example.test/**", (route) =>
    route.fulfill({
      json: {
        json: route.request().url().includes("/auth/identity")
          ? { telegramUserId: "101" }
          : sessionFixture({
              worker: "UNAVAILABLE",
              source: "STORED",
              connection: "UNKNOWN",
            }),
      },
    }),
  );
  await page.goto("/e2e/harness.html?telegram");
  await expect(
    page.getByRole("button", { name: "قطع اتصال تلگرام", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("شماره تلفن با کد کشور")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "بررسی عضویت", exact: true }),
  ).toBeDisabled();
});

test("a login rejected before sendCode displays its operation error", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 420 });
  let operation: TelegramOperation | null = null;
  let observations = 0;
  const message = "برای ورود جدید ابتدا اتصال فعلی را قطع کنید.";
  await page.route("https://api.example.test/**", async (route) => {
    const url = new URL(route.request().url());
    let result: unknown = null;
    if (url.pathname.endsWith("/auth/identity"))
      result = { telegramUserId: "101" };
    if (url.pathname.endsWith("/telegram/status"))
      result = sessionFixture({
        authorization: "REVOKED",
        connection: "OFFLINE",
        membership: "UNKNOWN",
        observedAt: new Date().toISOString(),
      });
    if (url.pathname.endsWith("/telegram/operation")) {
      observations++;
      result = operation;
    }
    if (url.pathname.endsWith("/telegram/command")) {
      const { json: input } = route.request().postDataJSON();
      // The initial observation may reach the API before admission commits.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const at = new Date().toISOString();
      operation = {
        operationId: input.operationId,
        type: "login",
        status: "FAILED",
        revision: 1,
        challengeId: input.operationId,
        requestId: input.operationId,
        acceptedAt: at,
        completedAt: at,
        issue: { code: "SESSION_EXISTS", message },
        cancelledRequests: 0,
        sendingRequests: 0,
      };
      result = { operationId: input.operationId, acceptedAt: at };
    }
    await route.fulfill({ json: { json: result } });
  });
  await page.goto("/e2e/harness.html?telegram");
  await page.getByLabel("شماره تلفن با کد کشور").fill("+989121234567");
  await page.getByRole("button", { name: "ارسال کد ورود" }).click();
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByText(message, { exact: true })).toBeInViewport();
  await expect(page.getByText(message, { exact: true })).toHaveCount(1);
  expect(observations).toBeGreaterThan(0);
});
