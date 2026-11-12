import type { Metadata } from "next";
import { LITE_DECK } from "@/data/cards";
import { JournalView } from "@/components/JournalView";
import styles from "./dnevnik.module.css";

export const metadata: Metadata = {
  title: "Дневник раскладов",
  description: "Ваши прошлые расклады и заметки к ним. Хранятся только в этом браузере.",
  alternates: { canonical: "/dnevnik" },
  robots: { index: false, follow: true },
};

export default function JournalPage() {
  return (
    <div className={`page ${styles.wrap}`}>
      <header className={styles.head}>
        <h1>Дневник раскладов</h1>
        <p>
          Здесь сохраняются ваши расклады и мысли к ним. Дневник хранится только в этом браузере: его не видит никто,
          кроме вас, но и на другом устройстве его не будет.
        </p>
      </header>
      <JournalView deck={LITE_DECK} />
    </div>
  );
}
