(() => {
  "use strict";

  let theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  try {
    const savedTheme = localStorage.getItem("antonio-theme");
    if (savedTheme === "light" || savedTheme === "dark") theme = savedTheme;
  } catch {
    // Private browsing and file URLs can restrict persistent storage.
  }

  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#14232d" : "#edf2f4");
})();
