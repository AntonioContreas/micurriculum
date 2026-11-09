"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const html = read("index.html");
const css = read("css/styles.css");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const context = { window: {} };
vm.runInNewContext(read("js/translations.js"), context);
const translations = context.window.CV_TRANSLATIONS;

test("HTML has no embedded styles, scripts, SVGs or event handlers", () => {
  assert.doesNotMatch(html, /<style\b|<svg\b|\sstyle\s*=|\son[a-z]+\s*=|javascript:|data:image/i);
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.match(script[1], /\bsrc="js\/[^\"]+"/);
    assert.equal(script[2].trim(), "");
  }
});

test("all local HTML and CSS assets exist and use relative URLs", () => {
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^(?:https?:|mailto:|tel:|whatsapp:)/.test(match[1])) continue;
    assert.ok(!match[1].startsWith("/"), `Absolute asset URL: ${match[1]}`);
    assert.ok(fs.existsSync(path.join(root, decodeURIComponent(match[1].split("?")[0]))), `Missing ${match[1]}`);
  }
  for (const file of ["css/styles.css", "css/opportunity.css"]) {
    for (const match of read(file).matchAll(/url\("([^"]+)"\)/g)) {
      assert.ok(fs.existsSync(path.resolve(root, "css", match[1])), `Missing ${match[1]}`);
    }
  }
});

test("navigation targets resolve and all seven dialogs have accessible titles", () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]));
  for (const match of html.matchAll(/data-open-dialog="([^"]+)"/g)) {
    assert.match(html, new RegExp(`<dialog id="${match[1]}" aria-labelledby="[^"]+"`));
  }
  for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
  assert.equal((html.match(/<dialog /g) || []).length, 7);
});

test("Spanish and English keys match and every translation reference exists", () => {
  assert.deepEqual(Object.keys(translations.es).sort(), Object.keys(translations.en).sort());
  for (const language of ["es", "en"]) {
    for (const [key, value] of Object.entries(translations[language])) {
      assert.ok(typeof value === "string" && value.trim(), `${language}.${key} is empty`);
    }
    for (const match of html.matchAll(/data-i18n(?:-aria|-alt|-content|-placeholder)?="([^"]+)"/g)) {
      assert.ok(translations[language][match[1]], `Unknown key ${language}.${match[1]}`);
    }
  }
});

test("Spanish fallback copy matches the translated content without JavaScript", () => {
  for (const match of html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
    assert.equal(match[2].replaceAll("&amp;", "&"), translations.es[match[1]], `Stale fallback: ${match[1]}`);
  }
});

test("all contact channels use Antonio's source-backed identity", () => {
  assert.match(html, /https:\/\/wa\.me\/56964262904/);
  for (const phone of html.matchAll(/tel:([^"\s]+)/g)) assert.equal(phone[1], "+56964262904");
  for (const email of html.matchAll(/mailto:([^"\s]+)/g)) assert.equal(email[1], "Ancburgos51@gmail.com");
  const contact = read("assets/antonio-contreras.vcf");
  assert.match(contact, /FN:Antonio Contreras Burgos/);
  assert.match(contact, /TITLE:Ingeniero en Recursos Humanos/);
  assert.match(contact, /TEL;TYPE=CELL:\+56964262904/);
  assert.match(contact, /EMAIL;TYPE=INTERNET:Ancburgos51@gmail.com/);
  const payload = read("assets/antonio-contact.txt").trimEnd();
  assert.equal(payload.split(/\r?\n/).length, 4);
  assert.match(payload, /^Nombre: Antonio Contreras Burgos$/m);
  assert.match(payload, /^Teléfono: \+56 9 6426 2904$/m);
});

test("contact opens locally and the opportunity draft must be reviewed", () => {
  assert.match(html, /data-open-dialog="contact-dialog"/);
  assert.match(html, /id="contact-whatsapp" href="whatsapp:\/\/send\/\?phone=56964262904"/);
  assert.match(html, /id="contact-email"[^>]*value="Ancburgos51@gmail\.com"[^>]*readonly/);
  assert.match(html, /id="opportunity-continue"[^>]*aria-disabled="true"/);
  const opportunity = read("js/opportunity.js");
  assert.match(opportunity, /whatsapp:\/\/send\/\?phone=56964262904&text=\$\{encodedMessage\}/);
  assert.match(opportunity, /https:\/\/wa\.me\/56964262904\?text=\$\{encodedMessage\}/);
  assert.match(opportunity, /encodeURIComponent\(reviewedMessage\)/);
  assert.doesNotMatch(opportunity, /localStorage|sessionStorage|\bfetch\(|XMLHttpRequest|innerHTML/);
  assert.equal(translations.es["opportunity.greeting"], "Hola, Antonio:");
});

test("education and experience follow the original CV without inventing credentials", () => {
  assert.equal(translations.es["hero.role"], "Ingeniero en Recursos Humanos");
  assert.match(translations.es["hero.degreeNote"], /Titulado · IACC/);
  assert.match(translations.es["studies.accountingDetail"], /Egresado en Contabilidad/);
  assert.equal(translations.es["tools.audit"], "Auditoría contable");
  assert.match(translations.es["hero.summary"], /habilidades técnico-contables y de auditoría/);
  assert.doesNotMatch(html + JSON.stringify(translations), /contador auditor titulado|certified auditor|driving licence|licencia de conducir|\bSAP\b|\bPower BI\b|\bScrum\b|\bKanban\b/i);
  for (const company of ["FedEx", "TNT", "Chilexpress", "Bellsouth", "Vidacorp"]) assert.ok(html.includes(company));
  assert.deepEqual([...html.matchAll(/data-count="(\d+)"/g)].map((match) => match[1]), ["5", "10", "20"]);
  assert.match(translations.es["career.vidacorpDate"], /Fecha no indicada/);
});

test("the original PDF remains byte-for-byte intact and is the download target", () => {
  const filename = "Curriculum Antonio C.  reformulado..pdf";
  const pdf = fs.readFileSync(path.join(root, filename));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(crypto.createHash("sha256").update(pdf).digest("hex"), "67d40176d4f8dd2f75f318f4d72f54a9522bc0886e4c7f4a0fd4dd4c47d429ef");
  const download = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*download="([^"]+)"/g)].find((match) => match[2] === filename);
  assert.ok(download);
  assert.equal(decodeURIComponent(download[1]), filename);
  assert.ok(fs.existsSync(path.join(root, ".nojekyll")));
});

test("the template keeps its three cards, compact overview and scrollable studies dialog", () => {
  assert.equal((html.match(/class="profile-card(?: profile-card--accent)?"/g) || []).length, 3);
  const studies = html.match(/<dialog id="studies-dialog"[\s\S]*?<\/dialog>/)[0];
  assert.doesNotMatch(studies, /adaptive-dialog|personal-dialog/);
  assert.match(css, /dialog > article\s*\{[^}]*overflow-y: auto/);
  assert.match(css, /\.screen-section\s*\{[^}]*100svh/);
  assert.match(html, /class="detail-dialog personal-dialog adaptive-dialog"/);
  assert.equal((html.match(/data-open-dialog="gallery-dialog"/g) || []).length, 2);
});

test("no personal content, portrait, contact or storage settings leak from the template", () => {
  const files = ["index.html", "js/translations.js", "js/app.js", "js/theme.js", "js/opportunity.js", "assets/antonio-contact.txt", "assets/antonio-contreras.vcf"];
  for (const file of files) assert.doesNotMatch(read(file), /paulina|64194547|paucontreras|coca-cola|andrés bello|peñaflor/i, file);
  assert.doesNotMatch(html, /img\/foto\.jpg/);
  assert.match(html, /class="brand-monogram"[^>]*>AC<span>/);
  assert.match(read("img/favicon.svg"), />AC<\/text>/);
  assert.match(read("js/app.js"), /antonio-language/);
  assert.match(read("js/theme.js"), /antonio-theme/);
});

test("the social row replaces email with the supplied LinkedIn profile and icon", () => {
  const social = html.match(/<div class="social-links">[\s\S]*?<\/div>/)[0];
  const linkedIn = social.match(/<a class="social-link" href="https:\/\/www\.linkedin\.com\/in\/antonio-contreras-b63264137\/"[^>]*>[\s\S]*?<\/a>/)?.[0];
  assert.ok(linkedIn, "The supplied LinkedIn profile is missing");
  assert.match(linkedIn, /target="_blank"/);
  assert.match(linkedIn, /rel="noopener noreferrer"/);
  assert.match(linkedIn, /class="icon icon--linkedin" aria-hidden="true"/);
  assert.match(linkedIn, />LinkedIn<\/span>/);
  assert.match(linkedIn, /data-i18n="a11y.newTab"/);
  assert.doesNotMatch(social, /mailto:|social\.email|icon--mail/);
  assert.match(social, /https:\/\/wa\.me\/56964262904/);
  assert.match(html, /mailto:Ancburgos51@gmail.com/);
});

test("both palettes provide readable text and button contrast", () => {
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const theme of ["light", "dark"]) {
    const block = theme === "light" ? css.slice(0, css.indexOf('[data-theme="dark"]')) : css.slice(css.indexOf('[data-theme="dark"]'));
    const token = (name) => block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"))[1];
    const surfaces = ["--page", "--surface", "--surface-soft", "--surface-accent"].map(token);
    if (theme === "light") surfaces.push("#edf4f5", "#e3eeed", "#d2e3e4", "#d7e8e8", "#e3ebf1");
    for (const foreground of ["--ink", "--muted", "--accent"].map(token)) {
      for (const background of surfaces) assert.ok(contrast(foreground, background) >= 4.5, `${theme}: ${foreground} on ${background}`);
    }
    const buttonInk = theme === "light" ? "#ffffff" : token("--button-ink");
    for (const background of [token("--button-bg"), token("--accent-strong")]) assert.ok(contrast(buttonInk, background) >= 4.5);
  }
});

test("all runtime libraries, fonts and graphics are local with reduced-motion support", () => {
  assert.match(read("css/vendor/pico.min.css").slice(0, 200), /Pico CSS[^\n]*v2\.1\.1/);
  assert.doesNotMatch(html, /(?:src|href)="https?:[^\"]+\.(?:css|js|woff2?|png|jpg)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(read("css/opportunity.css"), /@media screen and \(prefers-reduced-motion: no-preference\)/);
});
