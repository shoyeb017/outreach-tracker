import { expect, test } from "@playwright/test";

test("landing uses supplied branding, continuous rays and responsive mail visuals in both themes", async ({ page, request }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.goto("/");
  await expect(page).toHaveTitle("AUTMAIL - Email Automation System");
  await expect(page.getByText("Microsoft email automation", { exact: true })).toBeVisible();
  await expect(page.locator(".brand-tagline")).toHaveCount(0);
  await expect(page.locator("footer")).toContainText("AUTMAIL - Email Automation System");
  const background = page.locator(".blue-tubes-layer");
  await expect(background).toHaveAttribute("data-animation-state", /running|fallback/);
  const graphicsAvailable = await page.evaluate(() => {
    const probe = document.createElement("canvas").getContext("webgl2");
    if (!probe) return false;
    probe.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  });
  if (graphicsAvailable) await expect(background).toHaveAttribute("data-animation-state", "running");
  expect(await page.locator(".landing-hero").evaluate((element) => element.getBoundingClientRect().width)).toBe(1536);
  expect(await page.locator(".landing-page").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(248, 250, 255)");
  await expect(page.locator("nav .brand-logo-light")).toBeVisible();
  await expect(page.locator("nav .brand-logo-dark")).toBeHidden();
  await expect(page.getByRole("button", { name: /Pause animation|Play animation|Sign out/ })).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Illustration of a spreadsheet/ })).toBeVisible();
  await expect(page.locator(".mail-float")).toHaveCount(3);
  await expect(page.locator(".mail-review")).toBeVisible();
  // 3D transforms must not let the main plane paint over the review card.
  expect(await page.locator(".mail-review strong").evaluate((element) => {
    const box = element.getBoundingClientRect();
    return Boolean(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest(".mail-review"));
  })).toBe(true);
  expect(await page.locator(".mail-message").evaluate((element) => getComputedStyle(element).animationIterationCount)).toBe("infinite");
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(icon).toContain("autmail_icon");
  expect((await request.get(icon!)).status()).toBe(200);
  const originalCanvas = await page.locator("canvas").elementHandle();
  await page.screenshot({ path: info.outputPath("mail-hero-light-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect(await page.locator(".landing-page").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(0, 0, 0)");
  await expect(page.locator("nav .brand-logo-dark")).toBeVisible();
  await expect(page.locator("nav .brand-logo-light")).toBeHidden();
  expect(await originalCanvas!.evaluate((element) => element.isConnected)).toBe(true);
  await page.screenshot({ path: info.outputPath("mail-hero-dark-desktop.png"), fullPage: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await expect(background).toHaveAttribute("data-animation-state", /running|fallback/);
  if (await background.getAttribute("data-animation-state") === "running") {
    await page.mouse.move(100, 300); await page.mouse.move(1400, 500);
    await expect(background).toHaveAttribute("data-animation-state", "running");
    await page.locator("canvas").evaluate((canvas) => canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })));
    await expect(background).toHaveAttribute("data-animation-state", "fallback");
  }
  for (const theme of ["dark", "light"]) {
    if (theme === "light") await page.getByRole("button", { name: "Switch to light mode" }).click();
    for (const width of [360, 390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.locator(".landing-hero").evaluate((element) => element.getBoundingClientRect().width)).toBe(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".mail-scene-caption")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`mail-hero-${theme}-mobile.png`), fullPage: true });
  }
  await page.getByRole("link", { name: "Read the setup guide" }).click();
  await expect(page).toHaveURL("/help");
  expect(errors).toEqual([]);
});

test("desktop hero fits the first screen, including shorter laptop windows", async ({ page }, info) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    for (const [width, height] of [[1024, 768], [1280, 720], [1366, 768], [1366, 640], [1536, 864], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      // Chromium can acknowledge a resize before recalculating svh/media queries.
      // Wait for the actual layout rather than measuring the previous viewport.
      await expect.poll(() => page.locator(".landing-hero").evaluate((element) => element.getBoundingClientRect().bottom), {
        message: `${theme} hero fits ${width}x${height} after viewport layout settles`,
      }).toBeLessThanOrEqual(height);
      const bounds = await page.evaluate(() => ({
        heroBottom: document.querySelector(".landing-hero")!.getBoundingClientRect().bottom,
        illustrationBottom: document.querySelector(".mail-scene")!.getBoundingClientRect().bottom,
        scroll: scrollY,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      expect(bounds.scroll).toBe(0);
      expect(bounds.heroBottom, `${theme} ${width}x${height}`).toBeLessThanOrEqual(height);
      expect(bounds.illustrationBottom, `${theme} illustration ${width}x${height}`).toBeLessThanOrEqual(height);
      expect(bounds.overflow).toBe(false);
      await expect(page.getByRole("link", { name: "Create your workspace" })).toBeVisible();
      if (width === 1366 && height === 640) await page.screenshot({ path: info.outputPath(`compact-hero-${theme}-laptop.png`) });
    }
  }
});

test("landing actions and illustration stay contained with enlarged text", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expect(page.locator("html")).toHaveCSS("font-size", "32px");
  await expect(page.getByRole("link", { name: "Create your workspace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.locator(".mail-scene-caption")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("mail-hero-enlarged-mobile.png"), fullPage: true });
});

test("reduced motion and unavailable graphics keep the landing page functional", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "reduced");
  expect(await page.locator(".mail-message").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect(page.getByRole("button", { name: "Pause animation" })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("blue-rays-mobile.png"), fullPage: true });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (args[0] === "webgl2") return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.reload();
  await expect(page.locator(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "fallback");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create your workspace" })).toBeVisible();
  expect(await page.locator("canvas").evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test("documentation has a connected workflow, working section anchors and Markdown downloads", async ({ page, request }, info) => {
  await page.goto("/help");
  await page.getByRole("navigation", { name: "Guide sequence" }).getByRole("link", { name: /Spreadsheet workflow/ }).click();
  await expect(page).toHaveURL("/help/spreadsheet-workflow");
  await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: /Personalize/ }).click();
  await expect(page).toHaveURL(/#personalize-where-the-message-values-come-from$/);
  await page.goto("/help/safety");
  await expect(page.getByRole("heading", { name: "Understand duplicate protection" })).toBeVisible();
  const markdown = await request.get("/help/safety/markdown");
  expect(markdown.status()).toBe(200);
  expect(markdown.headers()["content-type"]).toContain("text/markdown");
  expect(await markdown.text()).toContain("same template and recipient address");
  expect((await request.get("/help/unknown/markdown")).status()).toBe(404);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: info.outputPath("sending-safety-desktop.png"), fullPage: true });
});
