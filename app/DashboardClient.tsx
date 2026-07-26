"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { DashboardData } from "@/lib/dashboard/loadDashboard";
import {
  PERIOD_PRESET_OPTIONS,
  type PeriodPreset,
} from "@/lib/dashboard/period";

type Props = {
  data: DashboardData;
};

function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(Math.round(value)) + "円";
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function DashboardClient({ data }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preset, setPreset] = useState<PeriodPreset>(data.period.preset);
  const [from, setFrom] = useState(data.period.from);
  const [to, setTo] = useState(data.period.to);

  function applyPeriod(next: {
    preset: PeriodPreset;
    from?: string;
    to?: string;
  }) {
    const params = new URLSearchParams();
    params.set("preset", next.preset);
    if (next.preset === "custom") {
      if (next.from) params.set("from", next.from);
      if (next.to) params.set("to", next.to);
    }
    startTransition(() => {
      router.push(`/?${params.toString()}`);
    });
  }

  const periodQuery = `from=${data.period.from}&to=${data.period.to}`;
  const casesPeriodHref = `/cases?${periodQuery}`;
  const paymentsUnpaidHref = "/payments?unpaid=1";
  const paymentsOverdueHref = "/payments?overdue=1";
  const casesUnorderedHref = "/cases?alert=unordered";
  const casesUninvoicedHref = "/cases?alert=uninvoiced";

  return (
    <div className="min-h-full bg-[#f4f5f7]">
      <header className="border-b border-gray-200 bg-white px-6 py-5 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          経営ダッシュボード
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          ValueOS Ver1.0 — 売上・粗利・業務アラートを一覧
        </p>
      </header>

      <main className={`space-y-6 p-6 md:p-8 ${pending ? "opacity-70" : ""}`}>
        {data.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {data.error}
          </div>
        ) : null}

        {/* ① 表示期間 */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            表示期間
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIOD_PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setPreset(opt.value);
                  if (opt.value !== "custom") {
                    applyPeriod({ preset: opt.value });
                  }
                }}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  preset === opt.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {preset === "custom" ? (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-xs text-gray-400">開始日</span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-gray-400">終了日</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <button
                type="button"
                onClick={() => applyPeriod({ preset: "custom", from, to })}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              >
                適用
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              {data.period.from} 〜 {data.period.to}
              <span className="ml-2 text-xs text-gray-400">
                （推移: {data.period.grain === "day" ? "日別" : "月別"}）
              </span>
            </p>
          )}
        </section>

        {/* ② KPI */}
        <section>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            KPI
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="売上"
              value={formatYen(data.kpis.sales)}
              href={casesPeriodHref}
            />
            <KpiCard
              label="実粗利"
              value={formatYen(data.kpis.profit)}
              href={casesPeriodHref}
            />
            <KpiCard
              label="粗利率"
              value={formatRate(data.kpis.profitRate)}
              href={casesPeriodHref}
            />
            <KpiCard
              label="未入金額"
              value={formatYen(data.kpis.unpaidAmount)}
              href={paymentsUnpaidHref}
              hint="現在時点の未回収残高"
              alert={data.kpis.unpaidAmount > 0}
            />
          </div>
        </section>

        {/* ③ 業務アラート */}
        <section>
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            業務アラート（現在）
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AlertCard
              label="未発注"
              count={data.alerts.unorderedCount}
              href={casesUnorderedHref}
            />
            <AlertCard
              label="未請求"
              count={data.alerts.uninvoicedCount}
              href={casesUninvoicedHref}
            />
            <AlertCard
              label="未入金"
              count={data.alerts.unpaidInvoiceCount}
              href={paymentsUnpaidHref}
            />
            <AlertCard
              label="期限超過"
              count={data.alerts.overdueInvoiceCount}
              href={paymentsOverdueHref}
              alert
            />
          </div>
        </section>

        {/* ④ 売上推移 */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                売上推移
              </div>
              <p className="mt-1 text-sm text-gray-500">売上 / 実粗利</p>
            </div>
            <div className="flex gap-4 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-sky-600" />
                売上
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" />
                実粗利
              </span>
            </div>
          </div>
          <TrendChart points={data.trend} />
        </section>
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  href,
  hint,
  alert,
}: {
  label: string;
  value: string;
  href: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-gray-400 hover:shadow-sm"
    >
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight ${
          alert ? "text-red-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-gray-400">{hint}</p> : null}
    </Link>
  );
}

function AlertCard({
  label,
  count,
  href,
  alert,
}: {
  label: string;
  count: number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-gray-400 hover:shadow-sm"
    >
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold ${
          alert && count > 0 ? "text-red-700" : "text-gray-900"
        }`}
      >
        {count}
        <span className="ml-1 text-sm font-medium text-gray-400">件</span>
      </p>
    </Link>
  );
}

function TrendChart({
  points,
}: {
  points: { key: string; label: string; sales: number; profit: number }[];
}) {
  if (points.length === 0) {
    return (
      <div className="mt-6 py-12 text-center text-sm text-gray-400">
        データがありません
      </div>
    );
  }

  const width = 720;
  const height = 220;
  const padX = 36;
  const padY = 20;
  const maxVal = Math.max(
    1,
    ...points.map((p) => Math.max(p.sales, p.profit))
  );
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;

  function y(v: number) {
    return padY + innerH - (v / maxVal) * innerH;
  }
  function x(i: number) {
    return padX + i * step;
  }

  const salesPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.sales)}`)
    .join(" ");
  const profitPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.profit)}`)
    .join(" ");

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="mt-4 overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height + 28}`}
        className="h-56 w-full min-w-[520px]"
        role="img"
        aria-label="売上と実粗利の推移"
      >
        <line
          x1={padX}
          y1={padY + innerH}
          x2={width - padX}
          y2={padY + innerH}
          stroke="#e5e7eb"
        />
        <path d={salesPath} fill="none" stroke="#0284c7" strokeWidth="2.5" />
        <path d={profitPath} fill="none" stroke="#059669" strokeWidth="2.5" />
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.key}
              x={x(i)}
              y={height + 18}
              textAnchor="middle"
              className="fill-gray-400"
              fontSize="10"
            >
              {p.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}
