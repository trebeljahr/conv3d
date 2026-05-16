import { expect, test } from "@playwright/test";

const REPO_URL = "https://github.com/trebeljahr/conv3d";

const IGNORED_CONSOLE = [/Download the React DevTools/i, /\[Fast Refresh\]/i, /WebGL.*deprecated/i];

function isIgnored(text: string): boolean {
  return IGNORED_CONSOLE.some((re) => re.test(text));
}

test.describe("landing page", () => {
  test("smoke: title, hero, CTAs, chart, canvas, no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !isIgnored(msg.text())) {
        errors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => {
      if (!isIgnored(err.message)) errors.push(err.message);
    });

    await page.goto("/");

    await expect(page).toHaveTitle(/conv3d/i);

    await expect(page.getByRole("heading", { level: 1, name: /conv3d/i })).toBeVisible();
    await expect(page.getByText(/Asset packs in\. Web-sized GLBs out\./)).toBeVisible();

    const primaryCta = page.getByRole("link", { name: /get started/i }).first();
    await expect(primaryCta).toBeVisible();
    await expect(primaryCta).toHaveAttribute("href", "/docs/getting-started");

    const githubCta = page.getByRole("link", { name: /view on github/i });
    await expect(githubCta).toBeVisible();
    await expect(githubCta).toHaveAttribute("href", REPO_URL);

    await expect(
      page.getByRole("img", { name: /File size comparison: FBX vs optimized GLB/i }),
    ).toBeVisible();

    await expect(page.locator("header canvas")).toHaveCount(1, { timeout: 10_000 });

    await page.waitForTimeout(3000);
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("mobile viewport: hero renders without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: /conv3d/i })).toBeVisible();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollWidth: doc.scrollWidth,
        clientWidth: doc.clientWidth,
      };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  test("visual regression: desktop hero", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await expect(page.locator("header").first()).toHaveScreenshot("hero-desktop.png");
  });

  test("visual regression: mobile hero", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await expect(page.locator("header").first()).toHaveScreenshot("hero-mobile.png");
  });
});
