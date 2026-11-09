"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");
const { PNG } = require("pngjs");
const jsQR = require("jsqr");

const root = path.resolve(__dirname, "..");
const baseURL = process.env.CV_TEST_URL || "http://127.0.0.1:4174/";
const screenshots = path.join(os.tmpdir(), "opencode", "cvantonio-review");
const chromePaths = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].filter(Boolean);

async function main() {
  const executablePath = chromePaths.find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, colorScheme: "light", reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  const externalRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));
  page.on("request", (request) => { if (!request.url().startsWith(baseURL)) externalRequests.push(request.url()); });
  let responsiveConfigurations = 0;
  let dialogConfigurations = 0;
  let accessibilityAudits = 0;

  async function audit(label) {
    const violations = await page.evaluate(async () => (await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }
    })).violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target), details: nodes.map((node) => node.failureSummary) })));
    assert.deepEqual(violations, [], `${label}: ${JSON.stringify(violations)}`);
    accessibilityAudits += 1;
  }

  try {
    fs.mkdirSync(screenshots, { recursive: true });
    await page.goto(baseURL);
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.title(), /Antonio Contreras/);
    assert.equal((await page.locator(".brand-monogram").textContent()).trim(), "AC.");
    assert.ok(await page.locator(".hero-portrait").evaluate((image) => image.complete && image.naturalWidth > 0));
    assert.deepEqual(await page.locator("[data-count]").allTextContents(), ["5", "10", "20"]);
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });

    const linkedInURL = "https://www.linkedin.com/in/antonio-contreras-b63264137/";
    const linkedIn = page.locator('.social-links a:has(.icon--linkedin)');
    assert.equal(await linkedIn.getAttribute("href"), linkedInURL);
    assert.equal(await page.locator('.social-links a[href^="mailto:"]').count(), 0);
    await context.route(linkedInURL, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>LinkedIn navigation test</title>" }));
    const originalURL = page.url();
    const [profileTab] = await Promise.all([context.waitForEvent("page"), linkedIn.click()]);
    await profileTab.waitForLoadState();
    assert.equal(profileTab.url(), linkedInURL);
    assert.equal(await profileTab.evaluate(() => window.opener), null);
    assert.equal(page.url(), originalURL);
    await profileTab.close();
    await context.unroute(linkedInURL);

    for (const language of ["es", "en"]) {
      if (await page.locator("html").getAttribute("lang") !== language) await page.locator("#language-toggle").click();
      for (const theme of ["light", "dark"]) {
        if (await page.locator("html").getAttribute("data-theme") !== theme) await page.locator("#theme-toggle").click();
        for (const width of [320, 360, 390, 600, 768, 800, 1024, 1080, 1280, 1366, 1440, 1920]) {
          await page.setViewportSize({ width, height: 900 });
          const layout = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            viewport: innerWidth,
            heroHeight: document.querySelector(".hero").getBoundingClientRect().height,
            overviewHeight: document.querySelector(".profile-section").getBoundingClientRect().height,
            headerHeight: document.querySelector(".site-header").getBoundingClientRect().height,
            rootBackground: getComputedStyle(document.documentElement).backgroundColor,
            themeColor: document.querySelector('meta[name="theme-color"]').content,
            offenders: [...document.querySelectorAll("body *")].filter((node) => node.getBoundingClientRect().right > innerWidth + 1).map((node) => node.className).slice(0, 8)
          }));
          assert.ok(layout.width <= width && layout.body <= width, `${language}/${theme}/${width}: ${JSON.stringify(layout)}`);
          assert.equal(layout.rootBackground, theme === "light" ? "rgb(237, 242, 244)" : "rgb(20, 35, 45)");
          assert.equal(layout.themeColor, theme === "light" ? "#edf2f4" : "#14232d");
          assert.ok(layout.heroHeight >= 900 - layout.headerHeight - 1, "The hero must retain its screen-sized layout");
          if (width >= 1024) assert.ok(layout.overviewHeight <= 900 - layout.headerHeight + 1, "Counters and cards must share one desktop screen");
          responsiveConfigurations += 1;
        }
        await page.setViewportSize({ width: 1366, height: 768 });
        await audit(`${language}/${theme}/page`);

        for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
          await page.setViewportSize(viewport);
          for (const id of ["personal-dialog", "studies-dialog", "experience-dialog", "contact-dialog", "opportunity-dialog", "qr-dialog", "gallery-dialog"]) {
            const trigger = page.locator(`[data-open-dialog="${id}"]`).last();
            await trigger.click();
            assert.ok(await page.locator(`#${id}`).evaluate((dialog) => dialog.open));
            assert.ok(await page.locator(`#${id}`).evaluate((dialog) => dialog.contains(document.activeElement)));
            const bounds = await page.locator(`#${id} > article`).evaluate((article) => ({
              top: article.getBoundingClientRect().top,
              bottom: article.getBoundingClientRect().bottom,
              scrollWidth: article.scrollWidth,
              clientWidth: article.clientWidth
            }));
            assert.ok(bounds.top >= 0 && bounds.bottom <= viewport.height + 1 && bounds.scrollWidth <= bounds.clientWidth + 1, `${id}/${language}/${theme}/${viewport.width}: ${JSON.stringify(bounds)}`);
            if (viewport.width === 1366) await audit(`${language}/${theme}/${id}`);
            if (id === "qr-dialog") {
              const png = PNG.sync.read(await page.locator(".qr-large").screenshot());
              const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
              assert.ok(decoded, `Rendered QR unreadable at ${viewport.width}x${viewport.height}`);
              assert.deepEqual(decoded.chunks[0], { type: "eci", assignmentNumber: 26 });
              assert.equal(decoded.data, fs.readFileSync(path.join(root, "assets/antonio-contact.txt"), "utf8").trimEnd());
            }
            await page.keyboard.press("Escape");
            assert.equal(await page.locator(`#${id}`).evaluate((dialog) => dialog.open), false);
            assert.ok(await trigger.evaluate((button) => button === document.activeElement));
            dialogConfigurations += 1;
          }
        }
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#menu-toggle").click();
    assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"), "true");
    await page.locator('.main-navigation [data-open-dialog="gallery-dialog"]').click();
    assert.equal(await page.locator("#menu-toggle").getAttribute("aria-expanded"), "false");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement === document.getElementById("menu-toggle"));

    await page.locator('[data-open-dialog="contact-dialog"]').click();
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.copiedEmail = text; } } });
    });
    await page.locator("#copy-contact-email").click();
    assert.equal(await page.evaluate(() => window.copiedEmail), "Ancburgos51@gmail.com");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    });
    await page.locator("#copy-contact-email").click();
    assert.equal(await page.locator("#contact-copy-status").getAttribute("data-i18n"), "contact.copyManually");
    await page.keyboard.press("Escape");

    for (const language of ["es", "en"]) {
      if (await page.locator("html").getAttribute("lang") !== language) await page.locator("#language-toggle").click();
      await page.locator('[data-open-dialog="opportunity-dialog"]').click();
      assert.equal(await page.locator("#opportunity-continue").getAttribute("aria-disabled"), "true");
      await page.locator("#opportunity-form button[type=submit]").click();
      assert.equal(await page.locator("#opportunity-continue").getAttribute("href"), null);
      await page.locator("#opportunity-company").fill("Test company & partners");
      await page.locator("#opportunity-role").fill("HR & accounting coordinator");
      await page.locator("#opportunity-description").fill("A professional opportunity in payroll, accounting and team management.");
      await page.locator("#opportunity-form button[type=submit]").click();
      const href = new URL(await page.locator("#opportunity-continue").getAttribute("href"));
      assert.equal(href.protocol, "whatsapp:");
      assert.equal(href.searchParams.get("phone"), "56964262904");
      assert.equal(href.searchParams.get("text"), await page.locator("#opportunity-message").textContent());
      assert.match(href.searchParams.get("text"), language === "es" ? /^Hola, Antonio:/ : /^Hello, Antonio:/);
      assert.equal(await page.locator("#opportunity-continue").getAttribute("aria-disabled"), "false");
      await page.locator("#opportunity-role").fill("Updated position");
      assert.equal(await page.locator("#opportunity-continue").getAttribute("href"), null);
      await page.locator("#reset-opportunity").click();
      assert.equal(await page.locator("#opportunity-company").inputValue(), "");
      await page.keyboard.press("Escape");
    }

    const [pdfDownload] = await Promise.all([page.waitForEvent("download"), page.locator(".hero-actions a[download]").click()]);
    assert.equal(pdfDownload.suggestedFilename(), "Curriculum Antonio C.  reformulado..pdf");
    assert.ok(fs.readFileSync(await pdfDownload.path()).equals(fs.readFileSync(path.join(root, "Curriculum Antonio C.  reformulado..pdf"))));
    await page.locator('[data-open-dialog="qr-dialog"]').click();
    const [vcardDownload] = await Promise.all([page.waitForEvent("download"), page.locator(".qr-save").click()]);
    assert.equal(vcardDownload.suggestedFilename(), "Antonio-Contreras.vcf");
    assert.ok(fs.readFileSync(await vcardDownload.path()).equals(fs.readFileSync(path.join(root, "assets/antonio-contreras.vcf"))));
    await page.keyboard.press("Escape");

    await page.reload();
    assert.equal(await page.locator("html").getAttribute("lang"), "en");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.locator("#language-toggle").click();
    await page.locator("#theme-toggle").click();
    for (const [label, width, height] of [["desktop", 1366, 768], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: path.join(screenshots, `${label}-light.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.locator("#theme-toggle").click();
    await page.screenshot({ path: path.join(screenshots, "desktop-dark.png"), fullPage: true });

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(baseURL);
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => [...document.querySelectorAll("[data-count]")].every((node) => node.textContent === "0"));
    await page.locator(".stats-grid").evaluate((grid) => grid.scrollIntoView({ behavior: "instant", block: "center" }));
    await page.waitForFunction(() => [...document.querySelectorAll("[data-count]")].some((node) => Number(node.textContent) > 0 && Number(node.textContent) < Number(node.dataset.count)));
    await page.waitForFunction(() => [...document.querySelectorAll("[data-count]")].every((node) => node.textContent === node.dataset.count));
    assert.deepEqual(errors, []);
    assert.deepEqual(failedRequests, []);
    assert.deepEqual(externalRequests, []);

    const fileContext = await browser.newContext({ reducedMotion: "reduce" });
    const filePage = await fileContext.newPage();
    await filePage.goto(pathToFileURL(path.join(root, "index.html")).href);
    await filePage.locator("#language-toggle").click();
    assert.equal(await filePage.locator("html").getAttribute("lang"), "en");
    await fileContext.close();

    console.log(JSON.stringify({ result: "PASS", responsiveConfigurations, dialogConfigurations, accessibilityAudits, contact: "correct phone/email, clipboard and fallback", opportunity: "validation, encoded message, review invalidation and reset in both languages; no messages sent", downloads: "original PDF and vCard exact bytes", qr: "rendered PNG/SVG with UTF-8 ECI 26", counters: "animated and reduced-motion paths", persistence: "independent language/theme settings", runtimeErrors: errors.length, failedRequests: failedRequests.length, externalRuntimeRequests: externalRequests.length, screenshots }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
