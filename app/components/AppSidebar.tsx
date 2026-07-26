"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  name: string;
  href: string;
  icon: ReactNode;
  exact?: boolean;
  children?: NavItem[];
};

type NavSubgroup = {
  label: string;
  items: NavItem[];
};

type NavEntry = NavItem | NavSubgroup;

type NavGroup = {
  label: string;
  entries: NavEntry[];
};

function isSubgroup(entry: NavEntry): entry is NavSubgroup {
  return "label" in entry && "items" in entry && !("href" in entry);
}

const iconClass = "h-4 w-4 shrink-0 opacity-80";

function IconDashboard() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4h7v7H4V4Zm9 0h7v5h-7V4ZM4 13h7v7H4v-7Zm9 3h7v4h-7v-4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconInvoice() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 3h8l4 4v14H7V3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M15 3v4h4M10 12h6M10 16h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPayment() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconTask() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6h11M9 12h11M9 18h11M4.5 6.5l1 1 2-2.5M4.5 12.5l1 1 2-2.5M4.5 18.5l1 1 2-2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStore() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10h16l-1.2-5H5.2L4 10Zm1 0v9h6v-5h2v5h6v-9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFactory() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 20V9l5 3V9l5 3V4h8v16H3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSeries() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M4 12h10M4 18h13"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBox() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 21 7.5v9L12 21 3 16.5v-9L12 3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M12 12 21 7.5M12 12v9M12 12 3 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPackage() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 8.5 12 4l9 4.5-9 4.5L3 8.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M3 8.5v7L12 20l9-4.5v-7M12 13v7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7h11v10H3V7Zm11 3h4l3 3v4h-7v-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="18" r="1.5" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="17" cy="18" r="1.5" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12V4h8l10 10-8 8L3 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
    </svg>
  );
}

function IconPrice() {
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 3 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

const dashboardItem: NavItem = {
  name: "ダッシュボード",
  href: "/",
  icon: <IconDashboard />,
  exact: true,
};

const navGroups: NavGroup[] = [
  {
    label: "業務",
    entries: [
      { name: "案件管理", href: "/cases", icon: <IconBriefcase /> },
      { name: "受注管理", href: "/admin/orders", icon: <IconOrders /> },
      { name: "請求管理", href: "/invoices", icon: <IconInvoice /> },
      { name: "入金管理", href: "/payments", icon: <IconPayment /> },
      { name: "タスク管理", href: "/tasks", icon: <IconTask /> },
    ],
  },
  {
    label: "マスタ",
    entries: [
      { name: "販売店", href: "/dealers", icon: <IconStore /> },
      {
        name: "メーカー",
        href: "/manufacturers",
        icon: <IconFactory />,
        children: [
          { name: "シリーズ", href: "/series", icon: <IconSeries /> },
        ],
      },
      {
        label: "商品",
        items: [
          { name: "商品一覧", href: "/products", icon: <IconBox /> },
          { name: "パッケージ商品一覧", href: "/packages", icon: <IconPackage /> },
          { name: "仕入価格", href: "/prices", icon: <IconTag /> },
          { name: "販売価格", href: "/sales-prices", icon: <IconPrice /> },
        ],
      },
      { name: "仕入先", href: "/suppliers", icon: <IconTruck /> },
    ],
  },
  {
    label: "設定",
    entries: [],
  },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({
  item,
  pathname,
  nested = false,
}: {
  item: NavItem;
  pathname: string;
  nested?: boolean;
}) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-lg py-2 text-sm transition ${
        nested ? "px-3 pl-9" : "px-3"
      } ${
        active
          ? "bg-gray-800 font-medium text-white"
          : "text-gray-300 hover:bg-gray-800/70 hover:text-white"
      }`}
    >
      {item.icon}
      <span>{item.name}</span>
    </Link>
  );
}

export default function AppSidebar() {
  const pathname = usePathname() || "/";

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-gray-900 text-white">
      <div className="border-b border-gray-700 px-5 py-5">
        <h1 className="text-xl font-bold tracking-tight">ValueOS</h1>
        <p className="mt-0.5 text-xs text-gray-400">住宅設備商社ERP</p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <div>
          <NavLink item={dashboardItem} pathname={pathname} />
        </div>

        {navGroups.map((group) => (
          <div key={group.label}>
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {group.label}
            </div>
            {group.entries.length > 0 ? (
              <ul className="space-y-0.5">
                {group.entries.map((entry) => {
                  if (isSubgroup(entry)) {
                    return (
                      <li key={entry.label} className="pt-1">
                        <div className="px-3 pb-1 text-[11px] font-medium text-gray-500">
                          {entry.label}
                        </div>
                        <ul className="space-y-0.5">
                          {entry.items.map((item) => (
                            <li key={item.href}>
                              <NavLink item={item} pathname={pathname} nested />
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  }

                  return (
                    <li key={entry.href}>
                      <NavLink item={entry} pathname={pathname} />
                      {entry.children?.length ? (
                        <ul className="mt-0.5 space-y-0.5">
                          {entry.children.map((child) => (
                            <li key={child.href}>
                              <NavLink item={child} pathname={pathname} nested />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ))}
      </nav>
    </aside>
  );
}
