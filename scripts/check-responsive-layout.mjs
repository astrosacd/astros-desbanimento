import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
const output = process.env.RESPONSIVE_SHOTS ?? "/tmp/responsive-shots";
await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--config",
    "tests/responsive-preview/vite.config.ts",
    "--host",
    "127.0.0.1",
    "--port",
    "4188",
    "--strictPort",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
server.stdout.on("data", (b) => (serverLog += b));
server.stderr.on("data", (b) => (serverLog += b));
let browser;
const failures = [],
  checks = [];
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch("http://127.0.0.1:4188/");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  if (!ready) throw Error(serverLog);
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  let pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const measure = async (label) => {
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const visible = (e) =>
        e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
      const box = (e) => {
        const r = e.getBoundingClientRect();
        return {
          tag: e.tagName,
          cls: String(e.className).slice(0, 140),
          text: e.textContent?.trim().slice(0, 70),
          left: Math.round(r.left),
          right: Math.round(r.right),
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
        };
      };
      return {
        width: innerWidth,
        height: innerHeight,
        scroll: document.documentElement.scrollWidth,
        overflow: [...document.querySelectorAll("body *")]
          .filter(
            (e) =>
              visible(e) &&
              e.getBoundingClientRect().right > innerWidth + 1 &&
              !e.closest(".table-scroll,pre,[data-local-scroll]"),
          )
          .slice(0, 12)
          .map(box),
        dialogs: [...document.querySelectorAll('[role="dialog"]:not([data-state="closed"])')]
          .filter(visible)
          .map(box),
        smallInputs: [
          ...document.querySelectorAll(
            "input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea",
          ),
        ]
          .filter(visible)
          .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16)
          .map(box),
        error: document.body.innerText.includes("Something went wrong"),
        unsupported: [...new Set(window.__fixtureUnsupported ?? [])],
      };
    });
    const issues = [];
    if (result.scroll > result.width + 1) issues.push("page overflow");
    if (
      result.dialogs.some(
        (r) =>
          r.left < 0 || r.right > result.width + 1 || r.top < 0 || r.bottom > result.height + 1,
      )
    )
      issues.push("dialog bounds");
    if (result.width <= 850 && result.smallInputs.length) issues.push("small mobile input");
    if (result.error || pageErrors.length) issues.push("render error");
    checks.push({ label, ...result, pageErrors: [...pageErrors], issues });
    if (issues.length) failures.push({ label, issues, result, pageErrors: [...pageErrors] });
    pageErrors = [];
  };
  const paths = [
    "/",
    "/desbanimento",
    "/nova-solicitacao",
    "/solicitacoes",
    "/carteira",
    "/ativacoes-sms",
    "/redes-sociais",
    "/prospeccao",
    "/pesquisa-digital",
    "/perfil",
    "/api",
    "/afiliacao",
    "/suporte",
    "/termos",
    "/novidades",
    "/login",
    "/cadastro",
    "/recuperar-senha",
    "/admin",
  ];
  const sizes =
    process.env.RESPONSIVE_QUICK === "admin"
      ? []
      : process.env.RESPONSIVE_QUICK
        ? [[375, 812]]
        : [
            [320, 640],
            [375, 812],
            [430, 932],
            [667, 375],
            [768, 1024],
            [850, 700],
            [851, 700],
            [1024, 768],
            [1366, 768],
            [1920, 1080],
            [390, 500],
          ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const path of paths) {
      await page.goto("http://127.0.0.1:4188" + path);
      await page.locator("[data-responsive-ready]").waitFor();
      await page.waitForTimeout(100);
      await measure(`${width}x${height} ${path}`);
      if (width === 375 || width === 1366)
        await page.screenshot({
          path: `${output}/${width}-${path.replaceAll("/", "") || "home"}.png`,
          fullPage: true,
        });
    }
    console.log("Checked " + width + "x" + height);
  }

  for (const [width, height] of process.env.RESPONSIVE_QUICK
    ? [[375, 812]]
    : [
        [320, 640],
        [667, 375],
        [1024, 768],
        [1366, 768],
      ]) {
    await page.setViewportSize({ width, height });
    await page.goto("http://127.0.0.1:4188/admin");
    await page.locator("[data-admin-section]").waitFor();
    for (const name of [
      "Gestão de contas",
      "Afiliação",
      "Visão geral",
      "Histórico de solicitações",
      "Envios em conferência",
      "Configurações do desbanimento",
      "Países e DDIs",
      "Logs da API",
      "Gestão de ativações",
      "Gestão de serviços",
      "Gestão de prospecção",
      "Gestão de pesquisas",
      "Dashboard financeiro",
      "Gateway e recargas",
      "Histórico de pagamentos",
      "Endereço do painel",
      "Status dos serviços",
      "Controle de módulos",
      "Comunicados",
      "Novidades",
      "Assistente ASTRA",
      "Central de suporte",
    ]) {
      if (width <= 850) {
        await page.getByRole("button", { name: "Abrir menu administrativo", exact: true }).click();
        await page.getByRole("dialog").waitFor();
        await page.waitForTimeout(550);
        await measure(`${width} admin drawer`);
      }
      const nav = page
        .getByRole("navigation", { name: "Menu administrativo" })
        .filter({ visible: true });
      while (await nav.locator('.service-nav-trigger[aria-expanded="false"]').count())
        await nav.locator('.service-nav-trigger[aria-expanded="false"]').first().click();
      await nav.getByRole("button", { name, exact: true }).click();
      if (width <= 850) await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page.waitForTimeout(150);
      await measure(`${width} admin ${name}`);
      console.log("Admin " + name);
      if (!(await page.locator("[data-admin-section]").count())) {
        console.log("Render failure " + (await page.locator("body").innerText()).slice(0, 300));
        await page.goto("http://127.0.0.1:4188/admin");
      }
      const tabs = await page
        .getByRole("tab")
        .evaluateAll((elements) => elements.map((e) => ({ id: e.id, text: e.textContent })));
      for (const { id, text } of tabs) {
        const tab = page
          .locator('[role="tab"][id=' + JSON.stringify(id) + "]")
          .filter({ visible: true });
        if ((await tab.count()) === 1) {
          await tab.click();
          await page.waitForTimeout(100);
          await measure(`${width} admin ${name} / ${text}`);
        }
      }
      if (width === 375)
        await page.screenshot({
          path: `${output}/admin-${name.replaceAll(" ", "-")}.png`,
          fullPage: true,
        });
    }
  }

  // Installed-window geometry is emulated; this is not a physical iOS/Android installation test.
  for (const [width, height, top, left, right, bottom] of [
    [375, 812, 47, 0, 0, 34],
    [667, 375, 0, 44, 44, 21],
  ]) {
    await page.setViewportSize({ width, height });
    const safe = () =>
      page.evaluate(
        ({ top, left, right, bottom }) => {
          for (const [key, value] of Object.entries({ top, left, right, bottom }))
            document.documentElement.style.setProperty("--app-safe-" + key, value + "px");
        },
        { top, left, right, bottom },
      );
    await page.goto("http://127.0.0.1:4188/pesquisa-digital");
    await page.locator("[data-responsive-ready]").waitFor();
    await safe();
    await measure(`${width} PWA safe areas`);
    const opener = page.getByRole("button", { name: "Abrir menu", exact: true });
    await opener.click();
    await page.waitForTimeout(550);
    await measure(`${width} PWA client menu`);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    if (!(await opener.evaluate((e) => e === document.activeElement)))
      throw Error("Client menu did not restore focus");
    await opener.click();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.setViewportSize({ width, height });
    await page
      .getByRole("button", { name: /Usar ferramenta/ })
      .first()
      .click();
    await page.getByLabel("Palavra-chave").fill("odontologia Fortaleza");
    await page.getByRole("button", { name: "Conferir e continuar" }).click();
    await page.getByRole("dialog").waitFor();
    await page.waitForTimeout(250);
    await measure(`${width} PWA price confirmation`);
    await page.keyboard.press("Escape");
    await page.goto("http://127.0.0.1:4188/pesquisa-digital?details");
    await page.getByRole("dialog").waitFor();
    await safe();
    for (const text of ["Sobre o perfil", "Atividade recente", "Perfis relacionados"])
      await page.getByText(text, { exact: true }).click();
    await page.getByText("Ver legenda", { exact: true }).first().click();
    await measure(`${width} PWA long profile results`);
    await page.screenshot({ path: `${output}/pwa-profile-${width}.png`, fullPage: true });
    const dialog = page.getByRole("dialog");
    await dialog.evaluate((e) => (e.scrollTop = e.scrollHeight));
    await measure(`${width} PWA results bottom`);
    await page.goto("http://127.0.0.1:4188/ativacoes-sms");
    await page.getByRole("combobox", { name: "Serviço", exact: true }).waitFor();
    await safe();
    await page.getByRole("combobox", { name: "Serviço", exact: true }).click();
    await page.getByPlaceholder("Digite para pesquisar…").waitFor();
    await measure(`${width} PWA option picker`);
    await page.keyboard.press("Escape");
    await page.goto("http://127.0.0.1:4188/admin");
    await page.locator("[data-admin-section]").waitFor();
    await safe();
    const adminOpener = page.getByRole("button", {
      name: "Abrir menu administrativo",
      exact: true,
    });
    await adminOpener.click();
    await page.waitForTimeout(550);
    await measure(`${width} PWA admin menu`);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    if (!(await adminOpener.evaluate((e) => e === document.activeElement)))
      throw Error("Admin menu did not restore focus");
  }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ synthetic: true, checks, failures }, null, 2),
  );
  if (failures.length) {
    console.log(
      JSON.stringify(
        failures.map(({ label, issues, result, pageErrors }) => ({
          label,
          issues,
          overflow: result.overflow,
          dialogs: result.dialogs,
          smallInputs: result.smallInputs,
          pageErrors,
        })),
        null,
        2,
      ),
    );
    throw Error(failures.length + " responsive checks failed.");
  }
  console.log(
    `PASS ${checks.length} real-page layout checks with synthetic data. No production requests.`,
  );
} finally {
  await browser?.close();
  server.kill();
}
