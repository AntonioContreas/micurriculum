(() => {
  "use strict";

  const dialog = document.getElementById("opportunity-dialog");
  if (!dialog) return;
  const form = document.getElementById("opportunity-form");
  const company = document.getElementById("opportunity-company");
  const role = document.getElementById("opportunity-role");
  const description = document.getElementById("opportunity-description");
  const fields = [company, role, description];
  const output = document.getElementById("opportunity-message");
  const continueLink = document.getElementById("opportunity-continue");
  const webFallback = document.getElementById("opportunity-web-fallback");
  const continuationLinks = [continueLink, webFallback];
  const status = document.getElementById("opportunity-status");
  const t = (key) => window.CV_TRANSLATIONS[document.documentElement.lang]?.[key] ?? window.CV_TRANSLATIONS.es[key] ?? key;
  let reviewedMessage = "";

  function setStep(step) {
    dialog.querySelectorAll("[data-opportunity-step]").forEach((element) => {
      const number = Number(element.dataset.opportunityStep);
      element.classList.toggle("is-complete", number < step);
      if (number === step) element.setAttribute("aria-current", "step");
      else element.removeAttribute("aria-current");
    });
  }

  function buildMessage() {
    const values = fields.map((field) => field.value.trim());
    if (!values.every(Boolean)) return "";
    return `${t("opportunity.greeting")}\n\n${t("opportunity.messageIntro")}\n\n${t("opportunity.company")}: ${values[0]}\n${t("opportunity.role")}: ${values[1]}\n\n${t("opportunity.description")}:\n${values[2]}\n\n${t("opportunity.messageEnd")}`;
  }

  function renderDraft() {
    output.textContent = buildMessage() || t("opportunity.empty");
    reviewedMessage = "";
    continuationLinks.forEach((link) => {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
    });
    status.textContent = "";
    setStep(1);
  }

  function validate() {
    fields.forEach((field) => field.setCustomValidity(field.value.trim() ? "" : t("opportunity.required")));
    if (description.value.trim() && description.value.trim().length < 15) description.setCustomValidity(t("opportunity.tooShort"));
    return form.reportValidity();
  }

  form.addEventListener("input", (event) => {
    event.target.setCustomValidity("");
    renderDraft();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!validate()) return;
    reviewedMessage = buildMessage();
    output.textContent = reviewedMessage;
    const encodedMessage = encodeURIComponent(reviewedMessage);
    continueLink.href = `whatsapp://send/?phone=56964262904&text=${encodedMessage}`;
    webFallback.href = `https://wa.me/56964262904?text=${encodedMessage}`;
    continuationLinks.forEach((link) => {
      link.setAttribute("aria-disabled", "false");
      link.removeAttribute("tabindex");
    });
    setStep(2);
    status.textContent = t("opportunity.ready");
    output.focus();
  });
  function continueToWhatsApp(event) {
    if (event.currentTarget.getAttribute("aria-disabled") === "true") {
      event.preventDefault();
      return;
    }
    if (!reviewedMessage || reviewedMessage !== buildMessage() || !form.checkValidity()) {
      event.preventDefault();
      renderDraft();
      status.textContent = t("opportunity.changed");
      return;
    }
    setStep(3);
    status.textContent = t(event.currentTarget === webFallback ? "opportunity.openedWeb" : "opportunity.opened");
  }
  continuationLinks.forEach((link) => link.addEventListener("click", continueToWhatsApp));
  document.getElementById("reset-opportunity").addEventListener("click", () => {
    form.reset();
    fields.forEach((field) => field.setCustomValidity(""));
    renderDraft();
    company.focus();
  });
  document.addEventListener("cv:language-change", () => {
    fields.forEach((field) => field.setCustomValidity(""));
    renderDraft();
  });
  document.querySelectorAll('[data-open-dialog="opportunity-dialog"]').forEach((button) => {
    button.addEventListener("click", renderDraft);
  });
  renderDraft();
})();
