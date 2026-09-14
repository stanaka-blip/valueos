import type { Metadata } from "next";
import AppSidebar from "./components/AppSidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ValueOS",
  description: "住宅設備商社ERP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="light">
      <body className="bg-white text-gray-900">
        <div className="flex min-h-screen bg-gray-100 text-gray-900">
          <AppSidebar />
          <main className="min-w-0 flex-1 text-gray-900">{children}</main>
        </div>
      </body>
    </html>
  );
}
