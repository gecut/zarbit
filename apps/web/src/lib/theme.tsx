import { useState } from "react";
import { Button } from "@heroui/react";
type Theme = "auto" | "light" | "dark";
const key = "zarbit.theme.v1";
function preference(): Theme {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : "auto";
  } catch {
    return "auto";
  }
}
export function applyTheme(theme = preference()) {
  const resolved =
    theme === "auto"
      ? (window.Telegram?.WebApp?.colorScheme ??
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"))
      : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.classList.toggle("light", resolved === "light");
}
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(preference);
  return (
    <section className="zb-surface form-card">
      <h2 className="form-label">ظاهر برنامه</h2>
      <div
        className="segment-grid segment-grid--three"
        role="group"
        aria-label="تم برنامه"
      >
        {(
          [
            ["auto", "خودکار"],
            ["light", "روشن"],
            ["dark", "تیره"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={value === theme ? "primary" : "secondary"}
            aria-pressed={theme === value}
            onPress={() => {
              setTheme(value);
              applyTheme(value);
              try {
                localStorage.setItem(key, value);
              } catch {
                /* Storage may be unavailable in WebView. */
              }
            }}
          >
            {label}
          </Button>
        ))}
      </div>
    </section>
  );
}
