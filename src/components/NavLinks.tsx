"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import styles from "./SiteHeader.module.css";

const LINKS = [
  { href: "/", label: "Расклад" },
  { href: "/karty", label: "Значения карт" },
  { href: "/blog", label: "Блог" },
  { href: "/dnevnik", label: "Дневник" },
];

export function NavLinks() {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);

  // мобильное меню закрывается после перехода
  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
  }, [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const list = (
    <ul className={styles.links}>
      {LINKS.map((l) => (
        <li key={l.href}>
          <Link href={l.href} className={styles.link} aria-current={isActive(l.href) ? "page" : undefined}>
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <nav className={styles.navWide} aria-label="Основная навигация">
        {list}
      </nav>
      <details className={styles.navNarrow} ref={menuRef}>
        <summary className={styles.menuButton}>
          <span>Меню</span>
        </summary>
        <nav className={styles.menuPanel} aria-label="Основная навигация">
          {list}
        </nav>
      </details>
    </>
  );
}
