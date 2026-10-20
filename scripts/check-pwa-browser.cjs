const fs = require("fs"),
  path = require("path"),
  { spawn } = require("child_process"),
  assert = require("assert/strict");
process.chdir(path.resolve(__dirname, ".."));
const reportDir = process.env.ASTROS_PWA_REVIEW_DIR || "/tmp/astros-pwa-review";
fs.mkdirSync(reportDir, { recursive: true });
const { chromium } = require(process.env.ASTROS_PLAYWRIGHT_MODULE || "playwright");
(async () => {
  const bin = process.env.ASTROS_CHROMIUM_PATH;
  const server = spawn(process.execPath, [".output/server/index.mjs"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "4183" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  let browser;
  const configPath = ".output/public/pwa/config.json",
    original = fs.readFileSync(configPath);
  try {
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch("http://127.0.0.1:4183/login");
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
    assert(ready, "local production server did not start: " + serverLog.slice(-1000));
    for (const path of ["/astros-sw.js", "/pwa/config.json", "/manifest.webmanifest"]) {
      const r = await fetch("http://127.0.0.1:4183" + path);
      assert(r.ok, path);
      assert.match(
        r.headers.get("cache-control") || "",
        /no-store|no-cache/,
        path + " cache header",
      );
    }
    browser = await chromium.launch({
      executablePath: bin,
      args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-zygote"],
    });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    // No signed-in accounts, provider calls or real payments are used.
    await page.goto("http://127.0.0.1:4183/login");
    await page.getByRole("button", { name: "Instalar Astros Mais" }).waitFor();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    const manifest = await page.evaluate(async () => {
      const r = await fetch(document.querySelector("link[rel=manifest]").href);
      return r.json();
    });
    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.scope, "/");
    assert.equal(manifest.display, "standalone");
    const cdp = await context.newCDPSession(page);
    const appManifest = await cdp.send("Page.getAppManifest");
    assert.equal(appManifest.errors.length, 0, JSON.stringify(appManifest.errors));
    await page.evaluate(() => caches.open("another-app-keep"));
    let widths = [];
    for (const [width, height] of [
      [320, 800],
      [375, 812],
      [430, 850],
      [667, 375],
      [768, 1024],
      [850, 1000],
      [1024, 768],
      [1440, 1000],
    ]) {
      await page.setViewportSize({ width, height });
      await page.getByRole("button", { name: "Instalar Astros Mais" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(250);
      const size = await dialog.boundingBox();
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(scroll <= width + 2, "page overflow " + width);
      assert(
        size &&
          size.x >= 0 &&
          size.x + size.width <= width + 2 &&
          size.y >= 0 &&
          size.y + size.height <= height + 2,
        "dialog overflow " + width,
      );
      if (width === 375 || width === 1440)
        await page.screenshot({
          path: path.join(reportDir, "install-" + width + ".png"),
          fullPage: true,
        });
      await page.getByRole("button", { name: "Continuar pelo navegador" }).click();
      widths.push(width);
    }
    const keys = await page.evaluate(async () => {
      const result = {};
      for (const name of await caches.keys())
        result[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
      return result;
    });
    assert.deepEqual(keys["astros-mais-pwa-offline-v1"], ["/pwa/offline.html"]);
    await context.setOffline(true);
    await page.goto("http://127.0.0.1:4183/carteira");
    await page.getByRole("heading", { name: "Vamos reconectar?" }).waitFor();
    await page.setViewportSize({ width: 320, height: 800 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(reportDir, "offline-320.png"), fullPage: true });
    await context.setOffline(false);
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await page.getByRole("heading", { name: "Entre na sua conta" }).waitFor();
    await page.getByRole("button", { name: "Instalar Astros Mais" }).waitFor();
    fs.writeFileSync(configPath, '{"enabled":false}');
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(
      async () =>
        !(await navigator.serviceWorker.getRegistrations()).some((r) =>
          [r.active, r.waiting, r.installing].some(
            (w) => w && new URL(w.scriptURL).pathname === "/astros-sw.js",
          ),
        ),
    );
    assert.equal(await page.locator("link[rel=manifest]").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Instalar Astros Mais" }).count(), 0);
    const after = await page.evaluate(() => caches.keys());
    assert.deepEqual(after, ["another-app-keep"]);
    await page.getByRole("heading", { name: "Entre na sua conta" }).waitFor();
    console.log(
      JSON.stringify({
        browser: "Chromium production build",
        headers: true,
        manifest: true,
        worker: true,
        viewportWidths: widths,
        offline: true,
        reconnection: true,
        disable: true,
        unrelatedCachePreserved: true,
      }),
    );
    await context.close();
  } finally {
    fs.writeFileSync(configPath, original);
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
