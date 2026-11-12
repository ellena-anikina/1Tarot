import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // SITE_NOINDEX=1 — тестовая версия сайта (например, на Vercel до настоящего домена): поисковики не добавляют
  // её страницы в выдачу, чтобы временный адрес потом не конкурировал с основным. Действует со следующей сборки.
  async headers() {
    if (process.env.SITE_NOINDEX !== "1") return [];
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
