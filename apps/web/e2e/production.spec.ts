import { expect, test } from "@playwright/test";

test("production bundle without Telegram shows authentication error, never a render crash", async ({
  page,
}) => {
  const errors: string[] = [];
  const paths: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://telegram.org/**", (route) =>
    route.fulfill({ body: "", contentType: "text/javascript" }),
  );
  await page.route("https://api.example.test/**", (route) => {
    paths.push(new URL(route.request().url()).pathname);
    return route.fulfill({
      status: 401,
      json: {
        json: {
          defined: false,
          code: "UNAUTHORIZED",
          status: 401,
          message: "invalid",
          data: { appCode: "UNAUTHORIZED" },
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("برنامه را از بات زربیت");
  expect(errors).toEqual([]);
  expect(paths).toEqual(["/rpc/auth/identity"]);
});
