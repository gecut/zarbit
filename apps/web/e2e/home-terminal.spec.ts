import { expect, test } from "@playwright/test";
import type { MarketSnapshot, RequestDetail } from "@zarbit/contracts";

const timestamp = "2026-09-13T10:00:00.000Z";
const snapshot: MarketSnapshot = {
  revision: 1,
  quote: { compactPrice: 105020, announcedAt: timestamp, sourceMessageId: 1 },
  trade: {
    id: "trade",
    compactPrice: 105040,
    quantity: 2,
    announcedAt: timestamp,
    sourceMessageId: 2,
  },
  tradeQuoteDifference: 20,
  recentTrades: [],
  asOf: timestamp,
};
const requests: RequestDetail[] = (["BUY", "SELL"] as const).map(
  (action, i) => ({
    id: `request-${i}`,
    action,
    condition: i === 0 ? "LTE" : "GTE",
    targetPrice: 105030,
    units: 2,
    status: "ACTIVE",
    executing: false,
    triggeredQuote: null,
    triggeredMessageId: null,
    outgoingMessageId: null,
    completedAt: null,
    failureReason: null,
    cancellationReason: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }),
);

for (const width of [320, 390, 1280]) {
  test(`terminal layout and intents at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() =>
      localStorage.setItem("zarbit.theme.v1", "dark"),
    );
    const errors: string[] = [];
    const unexpected: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://telegram.org/**", (route) =>
      route.fulfill({ body: "", contentType: "text/javascript" }),
    );
    await page.route("https://api.example.test/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/rpc/auth/identity")
        return route.fulfill({ json: { json: { telegramUserId: "101" } } });
      if (path === "/rpc/market/snapshot")
        return route.fulfill({ json: { json: snapshot } });
      if (path === "/rpc/requests/active")
        return route.fulfill({ json: { json: requests } });
      if (path === "/rpc/market/live") return route.abort();
      if (path.endsWith("/__batch__")) {
        const batch: unknown =
          route.request().method() === "GET"
            ? JSON.parse(
                new URL(route.request().url()).searchParams.get("batch") ??
                  "null",
              )
            : route.request().postDataJSON();
        if (!Array.isArray(batch))
          throw new Error("Expected an oRPC batch array");
        return route.fulfill({
          json: batch.map((item: unknown, index: number) => {
            if (
              !item ||
              typeof item !== "object" ||
              !("url" in item) ||
              typeof item.url !== "string"
            )
              throw new Error("Invalid batch item");
            const itemPath = new URL(item.url).pathname;
            if (
              !["/rpc/requests/active", "/rpc/market/snapshot"].includes(
                itemPath,
              )
            )
              unexpected.push(itemPath);
            return {
              index,
              status: 200,
              body: {
                json: itemPath === "/rpc/requests/active" ? requests : snapshot,
              },
            };
          }),
        });
      }
      unexpected.push(path);
      return route.abort();
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "درخواست‌های فعال" }),
    ).toBeVisible();
    await expect(page.getByLabel("وضعیت جریان بازار")).toContainText(
      "دریافت دوره‌ای",
    );
    await expect(
      page.getByText("مظنه قدیمی است", { exact: false }),
    ).toBeVisible();
    await expect(page.locator("article")).toHaveCount(2);
    await expect(page.locator("article").first()).toContainText(
      "کمتر یا مساوی",
    );
    await expect(page.locator("article").first()).toContainText("+۱۰");
    await page.getByRole("radio", { name: "هشدار ۰" }).click();
    await expect(
      page.getByText("در این فیلتر درخواستی وجود ندارد"),
    ).toBeVisible();
    await page.getByRole("radio", { name: "همه ۲" }).click();
    await expect(page.locator("article")).toHaveCount(2);
    const table = page.getByRole("grid", {
      name: "معاملات اخیر — داده نمونه",
    });
    await expect(table.locator("tbody tr")).toHaveCount(10);
    const heights = await table
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((row) => row.getBoundingClientRect().height),
      );
    expect(heights.every((height) => height >= 28 && height <= 32)).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`terminal-${width}-dark.png`),
      fullPage: true,
    });
    for (const action of ["خرید", "فروش", "هشدار"]) {
      await page
        .getByRole("group", { name: "عملیات معاملاتی سریع" })
        .getByRole("button", { name: action, exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByRole("button", { name: action, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await dialog.getByRole("button", { name: "انصراف", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("terminal loading, empty data and refresh error", async ({ page }) => {
  let failure = false;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://telegram.org/**", (route) =>
    route.fulfill({ body: "", contentType: "text/javascript" }),
  );
  await page.route("https://api.example.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/rpc/auth/identity")
      return route.fulfill({ json: { json: { telegramUserId: "101" } } });
    if (path === "/rpc/market/live") return route.abort();
    await pending;
    if (failure)
      return route.fulfill({
        status: 500,
        json: {
          json: {
            defined: false,
            code: "INTERNAL_SERVER_ERROR",
            status: 500,
            message: "private-server-error",
          },
        },
      });
    return route.fulfill({
      json: {
        json:
          path === "/rpc/requests/active"
            ? []
            : {
                ...snapshot,
                quote: null,
                trade: null,
                tradeQuoteDifference: null,
              },
      },
    });
  });
  try {
    await page.goto("/");
    await expect(page.getByLabel("در حال دریافت مظنه")).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByText("ثبت‌نشده", { exact: true })).toBeVisible();
  await expect(
    page.getByText("هیچ درخواست یا هشدار فعالی در جریان نیست"),
  ).toBeVisible();
  failure = true;
  await page
    .getByRole("button", { name: "تازه‌سازی آخرین اطلاعات بازار" })
    .click();
  await expect(
    page.getByText(
      "دریافت آخرین اطلاعات بازار ناموفق بود؛ دوباره تازه‌سازی کنید.",
    ),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.locator("body")).not.toContainText("private-server-error");
});
