"use client";

import { useEffect, useState } from "react";
import styles from "./SiteHeader.module.css";

type Theme = "night" | "paper";

const NAMES: Record<Theme, string> = { night: "Ночной бархат", paper: "Светлая бумага" };

// Переключатель нужен на время выбора дизайна. После выбора темы его можно удалить.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("night");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "paper" ? "paper" : "night");
  }, []);

  const next: Theme = theme === "night" ? "paper" : "night";

  function toggle() {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("tarot.theme", next);
    } catch {
      // приватный режим — тема просто не запомнится
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      className={styles.theme}
      onClick={toggle}
      aria-label={`Тема «${NAMES[theme]}». Переключить на «${NAMES[next]}»`}
      title={`Переключить на «${NAMES[next]}»`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.themeIcon}>
        {theme === "night" ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.5 1.5M17.2 17.2l1.5 1.5M5.3 18.7l1.5-1.5M17.2 6.8l1.5-1.5" />
          </g>
        )}
      </svg>
      <span className={styles.themeName}>{NAMES[theme]}</span>
    </button>
  );
}
