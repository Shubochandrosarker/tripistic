export function ThemeScript() {
  const code = `
    (function () {
      try {
        var stored = localStorage.getItem("tripistic-theme");
        var theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
        var root = document.documentElement;
        if (theme === "system") {
          root.removeAttribute("data-theme");
          root.style.colorScheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        } else {
          root.setAttribute("data-theme", theme);
          root.style.colorScheme = theme;
        }
      } catch (error) {}
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
