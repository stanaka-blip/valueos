"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  loadMasterPricePanels,
  type MasterPricePanelsData,
} from "@/lib/prices/loadMasterPricePanels";
import type { PriceTargetType } from "@/lib/prices/targetType";
import { supabase } from "@/lib/supabase";

type Props = {
  targetType: PriceTargetType;
  productId?: string;
  packageId?: string;
  defaultSupplierId?: string;
  defaultSupplierName?: string;
};

function formatYen(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString("ja-JP")}円`;
}

function formatDate(value: string | null | undefined): string {
  return value?.trim() || "—";
}

export default function MasterPricePanels({
  targetType,
  productId,
  packageId,
  defaultSupplierId,
  defaultSupplierName,
}: Props) {
  const [data, setData] = useState<MasterPricePanelsData | null>(null);
  const [loading, setLoading] = useState(true);

  const purchaseNewHref =
    targetType === "PRODUCT"
      ? `/prices/new?product_id=${productId || ""}`
      : `/prices/new?package_id=${packageId || ""}`;
  const salesNewHref =
    targetType === "PRODUCT"
      ? `/sales-prices/new?product_id=${productId || ""}`
      : `/sales-prices/new?package_id=${packageId || ""}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await loadMasterPricePanels(supabase, {
        targetType,
        productId,
        packageId,
        defaultSupplierId,
        defaultSupplierName,
      });
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    targetType,
    productId,
    packageId,
    defaultSupplierId,
    defaultSupplierName,
  ]);

  return (
    <section className="mx-auto mt-8 max-w-5xl space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">現行仕入価格</h2>
            <p className="mt-1 text-sm text-gray-500">
              標準仕入先の現在有効な仕入単価（判定日: {data?.asOfDate || "—"}）
            </p>
          </div>
          <Link
            href={purchaseNewHref}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
          >
            仕入価格を追加
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : data?.error ? (
          <p className="text-sm text-red-600">{data.error}</p>
        ) : !defaultSupplierId ? (
          <p className="text-sm text-gray-600">
            標準仕入先が未設定です。基本情報で標準仕入先を設定するか、仕入価格を追加してください。
          </p>
        ) : !data?.currentPurchase?.found ? (
          <div className="text-sm text-gray-700">
            <p>
              標準仕入先:{" "}
              <span className="font-semibold">
                {data?.currentPurchase?.supplierName ||
                  defaultSupplierName ||
                  "—"}
              </span>
            </p>
            <p className="mt-2 text-gray-600">
              現在有効な仕入価格はありません。
            </p>
          </div>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">標準仕入先</dt>
              <dd className="font-semibold text-gray-900">
                {data.currentPurchase.supplierName}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">現在有効な仕入価格</dt>
              <dd className="font-bold text-gray-900">
                {formatYen(data.currentPurchase.amount)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">適用開始日</dt>
              <dd>{formatDate(data.currentPurchase.startDate)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">適用終了日</dt>
              <dd>{formatDate(data.currentPurchase.endDate)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">現行販売価格</h2>
            <p className="mt-1 text-sm text-gray-500">
              販売店ごとの現在有効な販売単価
            </p>
          </div>
          <Link
            href={salesNewHref}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white"
          >
            販売価格を追加
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : data?.error ? (
          <p className="text-sm text-red-600">{data.error}</p>
        ) : !data?.currentSales.length ? (
          <p className="text-sm text-gray-600">
            現在有効な販売価格はありません。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-3 py-2">販売店</th>
                  <th className="px-3 py-2">現在有効な販売価格</th>
                  <th className="px-3 py-2">適用開始日</th>
                  <th className="px-3 py-2">適用終了日</th>
                </tr>
              </thead>
              <tbody>
                {data.currentSales.map((row) => (
                  <tr key={row.dealerId} className="border-t">
                    <td className="px-3 py-2 font-semibold">{row.dealerName}</td>
                    <td className="px-3 py-2 font-bold">
                      {formatYen(row.amount)}
                    </td>
                    <td className="px-3 py-2">{formatDate(row.startDate)}</td>
                    <td className="px-3 py-2">{formatDate(row.endDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <HistoryTable
        title="仕入価格履歴"
        partyLabel="仕入先"
        rows={data?.purchaseHistory || []}
        loading={loading}
        error={data?.error || null}
        emptyText="仕入価格の履歴はありません。"
      />

      <HistoryTable
        title="販売価格履歴"
        partyLabel="販売店"
        rows={data?.salesHistory || []}
        loading={loading}
        error={data?.error || null}
        emptyText="販売価格の履歴はありません。"
      />
    </section>
  );
}

function HistoryTable({
  title,
  partyLabel,
  rows,
  loading,
  error,
  emptyText,
}: {
  title: string;
  partyLabel: string;
  rows: {
    id: string;
    partyName: string;
    amount: number;
    startDate: string | null;
    endDate: string | null;
    isActive: boolean;
  }[];
  loading: boolean;
  error: string | null;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm md:p-6">
      <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>
      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2">{partyLabel}</th>
                <th className="px-3 py-2">価格</th>
                <th className="px-3 py-2">開始日</th>
                <th className="px-3 py-2">終了日</th>
                <th className="px-3 py-2">状態</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.partyName}</td>
                  <td className="px-3 py-2 font-semibold">
                    {formatYen(row.amount)}
                  </td>
                  <td className="px-3 py-2">{formatDate(row.startDate)}</td>
                  <td className="px-3 py-2">{formatDate(row.endDate)}</td>
                  <td className="px-3 py-2">
                    {row.isActive ? (
                      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                        有効
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-bold text-gray-700">
                        無効
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
