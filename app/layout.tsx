import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ValueOS",
  description: "住宅設備商社ERP",
};

const menuItems = [
  { name: "ダッシュボード", href: "/" },
  { name: "案件管理", href: "/cases" },
  { name: "請求管理", href: "/invoices" },
  { name: "販売店マスタ", href: "/dealers" },
  { name: "メーカーマスタ", href: "/manufacturers" },
  { name: "商品マスタ", href: "/products" },
  { name: "価格マスタ", href: "/prices" },
  { name: "タスク管理", href: "/tasks" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <div className="flex min-h-screen bg-gray-100">
          <aside className="w-64 bg-gray-900 text-white">
            <div className="border-b border-gray-700 px-6 py-6">
              <h1 className="text-2xl font-bold">ValueOS</h1>
              <p className="mt-1 text-sm text-gray-400">住宅設備商社ERP</p>
            </div>

            <nav className="p-4">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="mb-2 block rounded-lg px-4 py-3 text-sm hover:bg-gray-800"
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </aside>

          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}