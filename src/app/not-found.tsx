import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page" style={{ paddingTop: "clamp(48px, 8vw, 96px)", maxWidth: 720 }}>
      <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)", lineHeight: 1.08 }}>Такой страницы нет</h1>
      <p style={{ marginTop: 16, color: "var(--text-muted)", maxWidth: "52ch" }}>
        Возможно, адрес изменился или в нём опечатка. Начните с расклада или загляните в значения карт.
      </p>
      <p style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/" className="btn btn-primary">
          Сделать расклад
        </Link>
        <Link href="/karty" className="btn btn-quiet">
          Значения карт
        </Link>
      </p>
    </div>
  );
}
