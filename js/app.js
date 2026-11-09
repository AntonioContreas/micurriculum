(() => {
  "use strict";

  const root = document.documentElement;
  const translations = window.CV_TRANSLATIONS;
  const menuToggle = document.getElementById("menu-toggle");
  const navigation = document.getElementById("main-navigation");
  const languageToggle = document.getElementById("language-toggle");
  const themeToggle = document.getElementById("theme-toggle");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const desktopNavigation = window.matchMedia("(min-width: 1080px)");
  const dialogOpeners = new WeakMap();
  let language = "es";

  function remember(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // The controls remain functional when persistent storage is unavailable.
    }
  }

  function translate(key) {
    return translations[language][key] ?? translations.es[key] ?? key;
  }

  function updateMenuLabel() {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-label", translate(isOpen ? "menu.close" : "menu.open"));
  }

  function setMenu(open) {
    menuToggle.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
    menuToggle.querySelector(".icon").className = `icon icon--${open ? "close" : "menu"}`;
    updateMenuLabel();
  }

  function updateThemeControls() {
    const isDark = root.dataset.theme === "dark";
    const label = translate(isDark ? "theme.activateLight" : "theme.activateDark");
    themeToggle.setAttribute("aria-label", label);
    themeToggle.setAttribute("title", label);
    document.getElementById("theme-label").textContent = translate(isDark ? "theme.light" : "theme.dark");
    document.getElementById("theme-icon").className = `icon icon--${isDark ? "sun" : "moon"}`;
    document.querySelector('meta[name="theme-color"]').setAttribute("content", isDark ? "#14232d" : "#edf2f4");
  }

  function setLanguage(nextLanguage, announce = false) {
    language = Object.hasOwn(translations, nextLanguage) ? nextLanguage : "es";
    root.lang = language;
    document.title = translate("meta.title");

    const attributes = [
      ["data-i18n", null],
      ["data-i18n-aria", "aria-label"],
      ["data-i18n-alt", "alt"],
      ["data-i18n-content", "content"],
      ["data-i18n-placeholder", "placeholder"]
    ];

    for (const [source, destination] of attributes) {
      document.querySelectorAll(`[${source}]`).forEach((element) => {
        const value = translate(element.getAttribute(source));
        if (destination) element.setAttribute(destination, value);
        else element.textContent = value;
      });
    }

    document.getElementById("language-current").textContent = language.toUpperCase();
    document.getElementById("language-next").textContent = language === "es" ? "EN" : "ES";
    languageToggle.setAttribute("aria-label", translate("language.switch"));
    languageToggle.setAttribute("title", translate("language.switch"));
    updateMenuLabel();
    updateThemeControls();
    document.dispatchEvent(new CustomEvent("cv:language-change", { detail: { language } }));
    if (announce) document.getElementById("announcement").textContent = translate("language.changed");
  }

  try {
    language = localStorage.getItem("antonio-language") || "es";
  } catch {
    language = "es";
  }

  setLanguage(language);
  root.classList.add("js-enabled");
  document.getElementById("current-year").textContent = String(new Date().getFullYear());

  languageToggle.addEventListener("click", () => {
    setLanguage(language === "es" ? "en" : "es", true);
    remember("antonio-language", language);
  });

  themeToggle.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    remember("antonio-theme", root.dataset.theme);
    updateThemeControls();
  });

  menuToggle.addEventListener("click", () => setMenu(menuToggle.getAttribute("aria-expanded") !== "true"));

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a, [data-open-dialog]")) setMenu(false);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".header-inner")) setMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
      setMenu(false);
      menuToggle.focus();
    }
  });

  desktopNavigation.addEventListener("change", (event) => {
    if (event.matches) setMenu(false);
  });

  document.querySelectorAll("[data-open-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.openDialog);
      if (!dialog || dialog.open) return;
      if (dialog.id === "contact-dialog") {
        const status = document.getElementById("contact-copy-status");
        status.textContent = "";
        delete status.dataset.i18n;
      }
      dialogOpeners.set(dialog, button);
      dialog.showModal();
      root.classList.add("dialog-is-open");
    });
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => dialog.close());
    });

    let pointerStartedOnBackdrop = false;
    dialog.addEventListener("pointerdown", (event) => {
      pointerStartedOnBackdrop = event.target === dialog;
    });
    dialog.addEventListener("click", (event) => {
      if (pointerStartedOnBackdrop && event.target === dialog) dialog.close();
      pointerStartedOnBackdrop = false;
    });
    dialog.addEventListener("close", () => {
      if (!document.querySelector("dialog[open]")) root.classList.remove("dialog-is-open");
      const opener = dialogOpeners.get(dialog);
      if (opener?.getClientRects().length) opener.focus({ preventScroll: true });
      else if (opener?.closest("#main-navigation")) menuToggle.focus({ preventScroll: true });
    });
  });

  document.getElementById("copy-contact-email").addEventListener("click", async () => {
    const input = document.getElementById("contact-email");
    const status = document.getElementById("contact-copy-status");
    let messageKey;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(input.value);
      messageKey = "contact.copied";
    } catch {
      if (document.getElementById("contact-dialog").open) {
        input.focus({ preventScroll: true });
        input.select();
      }
      messageKey = "contact.copyManually";
    }
    status.dataset.i18n = messageKey;
    status.textContent = translate(messageKey);
  });

  const revealElements = document.querySelectorAll("[data-reveal]");

  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });

    revealElements.forEach((element) => {
      element.classList.add("will-reveal");
      revealObserver.observe(element);
    });
  }

  const counters = [...document.querySelectorAll("[data-count]")];
  const counterGrid = document.querySelector(".stats-grid");
  let counterObserver;
  let counterFrame = 0;
  let countersArmed = true;
  let countersVisible = false;
  let printingCounters = false;

  function finishCounters() {
    if (counterFrame) cancelAnimationFrame(counterFrame);
    counterFrame = 0;
    counters.forEach((counter) => {
      counter.textContent = counter.dataset.count;
    });
  }

  function resetCounters() {
    if (counterFrame) cancelAnimationFrame(counterFrame);
    counterFrame = 0;
    counters.forEach((counter) => { counter.textContent = "0"; });
  }

  function animateCounters() {
    if (!countersArmed || reducedMotion.matches || printingCounters) return;
    countersArmed = false;
    resetCounters();
    const startedAt = performance.now();
    const duration = 1800;

    function frame(now) {
      if (reducedMotion.matches || printingCounters) {
        finishCounters();
        return;
      }
      const progress = Math.max(0, Math.min((now - startedAt) / duration, 1));
      const easedProgress = 1 - (1 - progress) ** 2;
      counters.forEach((counter) => {
        counter.textContent = String(Math.floor(easedProgress * Number(counter.dataset.count)));
      });

      if (progress < 1) counterFrame = requestAnimationFrame(frame);
      else finishCounters();
    }

    counterFrame = requestAnimationFrame(frame);
  }

  function observeCounters() {
    counterObserver?.disconnect();
    const headerHeight = document.querySelector(".site-header").getBoundingClientRect().height;
    counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        countersVisible = entry.isIntersecting && entry.intersectionRatio > 0;
        if (!countersVisible) {
          // Re-arm only after a complete exit, not on small threshold changes.
          countersArmed = true;
          if (reducedMotion.matches || printingCounters) finishCounters();
          else resetCounters();
        } else if (entry.intersectionRatio >= 0.35) {
          animateCounters();
        }
      });
    }, { rootMargin: `-${headerHeight}px 0px 0px 0px`, threshold: [0, 0.35] });
    counterObserver.observe(counterGrid);
  }

  if (counterGrid && "IntersectionObserver" in window) {
    if (!reducedMotion.matches) resetCounters();
    observeCounters();
    desktopNavigation.addEventListener("change", observeCounters);
  }

  reducedMotion.addEventListener("change", () => {
    finishCounters();
    countersArmed = !countersVisible;
  });
  window.addEventListener("beforeprint", () => {
    printingCounters = true;
    countersArmed = false;
    finishCounters();
  });
  window.addEventListener("afterprint", () => {
    printingCounters = false;
    countersArmed = !countersVisible;
  });

  const trackedSections = ["inicio", "datos-personales", "estudios", "experiencia"];
  document.querySelectorAll('.main-navigation a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
      navigation.querySelectorAll("a").forEach((item) => item.removeAttribute("aria-current"));
      link.setAttribute("aria-current", "location");
    });
  });

  if ("IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      const currentId = visible[0].target.id;
      navigation.querySelectorAll("a").forEach((link) => {
        if (link.getAttribute("href") === `#${currentId}`) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-15% 0px -40% 0px", threshold: [0, 0.3, 0.7] });
    trackedSections.forEach((id) => sectionObserver.observe(document.getElementById(id)));
  }
})();
