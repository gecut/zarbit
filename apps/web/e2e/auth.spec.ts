import { expect, test } from "@playwright/test";

const endpoint = "https://api.example.test/**";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener(
      "unhandledrejection",
      () => (document.documentElement.dataset.rejection = "true"),
    );
  });
});
for (const strict of [false, true]) {
  test(`real provider identity and remount, strict=${strict}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    const paths: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(endpoint, (route) => {
      paths.push(new URL(route.request().url()).pathname);
      return route.fulfill({
        json: { json: { telegramUserId: "101" } },
      });
    });
    await page.goto(`/e2e/harness.html${strict ? "?strict" : ""}`);
    await expect(page.getByTestId("identity")).toBeVisible();
    await page.getByRole("button", { name: "toggle", exact: true }).click();
    await expect(page.getByTestId("identity")).toHaveCount(0);
    await page.getByRole("button", { name: "toggle", exact: true }).click();
    await expect(page.getByTestId("identity")).toBeVisible();
    expect(errors).toEqual([]);
    expect(paths).not.toContain("/rpc/");
    expect(paths).not.toContain("/rpc");
    if (info.project.name === "rpc")
      expect(paths).toContain("/rpc/auth/identity");
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-rejection",
      "true",
    );
  });
}
for (const [status, code, message] of [
  [401, "UNAUTHORIZED", "ورود معتبر نیست"],
  [403, "FORBIDDEN", "دسترسی این حساب"],
  [429, "TOO_MANY_REQUESTS", "تعداد تلاش‌ها زیاد"],
  [503, "SERVICE_UNAVAILABLE", "سرویس موقتاً"],
  [404, "NOT_FOUND", "پاسخ سرویس معتبر نیست"],
] as const) {
  test(`HTTP ${status} stays inside authentication gate`, async ({ page }) => {
    await page.route(endpoint, (route) =>
      route.fulfill({
        status,
        json: {
          json: {
            defined: false,
            code,
            status,
            message: "private-error",
            data: { appCode: code },
          },
        },
      }),
    );
    await page.goto("/e2e/harness.html");
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.getByTestId("identity")).toHaveCount(0);
    await expect(page.getByRole("alert")).not.toContainText("private-error");
    if (status === 401) {
      await expect(
        page.getByRole("button", { name: "تلاش دوباره" }),
      ).toHaveCount(0);
      await expect(page.getByRole("alert")).toContainText(
        "برنامه را از بات زربیت",
      );
    }
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-rejection",
      "true",
    );
  });
}
test("HTML response and disconnected network are recoverable", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "rpc");
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      body: "<h1>Not found</h1>",
    }),
  );
  await page.goto("/e2e/harness.html");
  await expect(page.getByRole("alert")).toContainText("پاسخ سرویس معتبر نیست");
  await page.unroute(endpoint);
  await page.route(endpoint, (route) => route.abort("failed"));
  await page.getByRole("button", { name: "تلاش دوباره" }).click();
  await expect(page.getByRole("alert")).toContainText("ارتباط برقرار نشد");
});
test("offline initial authentication resumes after reconnect", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "rpc");
  await page.route(endpoint, (route) =>
    route.fulfill({ json: { json: { telegramUserId: "101" } } }),
  );
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "onLine", { get: () => false }),
  );
  await page.goto("/e2e/harness.html");
  await expect(page.getByRole("status")).toContainText("اتصال اینترنت قطع است");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("identity")).toHaveText("101");
});
for (const kind of ["broken", "router"]) {
  test(`${kind} fallback is Persian and hides raw exception`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "rpc");
    await page.goto(`/e2e/harness.html?${kind}`);
    await expect(page.getByRole("alert")).toContainText("نمایش برنامه با مشکل");
    await expect(
      page.getByRole("button", { name: "بارگذاری مجدد" }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).not.toContainText("private-error");
  });
}
test("authentication deadline returns a recoverable network error", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "rpc");
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    await pending;
    await route.abort().catch(() => undefined);
  });
  try {
    await page.goto("/e2e/harness.html");
    await expect(page.getByRole("alert")).toContainText("ارتباط برقرار نشد", {
      timeout: 35_000,
    });
  } finally {
    release();
  }
});
