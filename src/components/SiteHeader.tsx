import Link from "next/link";
import { SITE } from "@/config/site";
import { NavLinks } from "./NavLinks";
import styles from "./SiteHeader.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <a href="#main" className={styles.skip}>
        Перейти к содержанию
      </a>
      <div className={`page ${styles.bar}`}>
        <Link href="/" className={styles.brand} aria-label={`${SITE.name} — на главную`}>
          <svg className={styles.mark} viewBox="-20 -20 40 40" aria-hidden="true">
            <circle r="17" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <rect x="-9" y="-9" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <rect x="-9" y="-9" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.3" transform="rotate(45)" />
            <circle r="2.6" fill="var(--accent)" />
          </svg>
          <span>{SITE.name}</span>
        </Link>
        <div className={styles.right}>
          <NavLinks />
        </div>
      </div>
    </header>
  );
}
