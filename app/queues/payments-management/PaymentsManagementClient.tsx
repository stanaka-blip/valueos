"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { submitThreePartyMoney } from "@/app/cases/[id]/submitThreePartyMoney";
import { calculateDealerSettlementPayout } from "@/lib/threeParty/dealerSettlementCalc";
import type {
  SupplierPaymentQueueRow,
  ThreePartyPaymentQueueRow,
} from "@/lib/queues/paymentsManagementQueue";

type TabKey = "three_party" | "supplier";

function formatYen(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.floor(value).toLocaleString("ja-JP")}円`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value;
}

function PriorityBadge({ rank, label }: { rank: number; label: string }) {
  const tone =
    rank === 1
      ? "bg-rose-50 text-rose-800"
      : rank === 2
        ? "bg-amber-50 text-amber-900"
        : "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

export default function PaymentsManagementClient({
  threePartyRows,
  supplierRows,
  initialTab = "three_party",
}: {
  threePartyRows: ThreePartyPaymentQueueRow[];
  supplierRows: SupplierPaymentQueueRow[];
  initialTab?: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [selectedThreeId, setSelectedThreeId] = useState<string | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    null
  );

  const selectedThree = useMemo(
    () => threePartyRows.find((r) => r.id === selectedThreeId) || null,
    [threePartyRows, selectedThreeId]
  );
  const selectedSupplier = useMemo(
    () => supplierRows.find((r) => r.id === selectedSupplierId) || null,
    [supplierRows, selectedSupplierId]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            {
              key: "three_party" as const,
              label: `3社間支払い（${threePartyRows.length}）`,
            },
            {
              key: "supplier" as const,
              label: `仕入先支払い（${supplierRows.length}）`,
            },
          ] as const
        ).map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={
                active
                  ? "rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "three_party" ? (
        <ThreePartyTable
          rows={threePartyRows}
          selectedId={selectedThreeId}
          onSelect={setSelectedThreeId}
        />
      ) : (
        <SupplierTable
          rows={supplierRows}
          selectedId={selectedSupplierId}
          onSelect={setSelectedSupplierId}
        />
      )}

      {tab === "three_party" && selectedThree ? (
        <ThreePartyActionPanel
          key={selectedThree.id}
          row={selectedThree}
          onDone={(nextId) => setSelectedThreeId(nextId)}
        />
      ) : null}

      {tab === "supplier" && selectedSupplier ? (
        <SupplierActionPanel
          key={selectedSupplier.id}
          row={selectedSupplier}
          onDone={() => setSelectedSupplierId(null)}
        />
      ) : null}
    </div>
  );
}

function ThreePartyTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: ThreePartyPaymentQueueRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        現在、3社間の支払待ちはありません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-[#f7f7f5] text-xs font-medium text-gray-500">
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">優先度</th>
            <th className="px-4 py-3 whitespace-nowrap">状態</th>
            <th className="px-4 py-3 whitespace-nowrap">信販入金日</th>
            <th className="px-4 py-3 whitespace-nowrap">販売店</th>
            <th className="px-4 py-3 whitespace-nowrap">案件番号</th>
            <th className="px-4 py-3 whitespace-nowrap">顧客名</th>
            <th className="px-4 py-3 whitespace-nowrap">信販会社</th>
            <th className="px-4 py-3 whitespace-nowrap">信販入金額</th>
            <th className="px-4 py-3 whitespace-nowrap">VE請求額</th>
            <th className="px-4 py-3 whitespace-nowrap">調整額</th>
            <th className="px-4 py-3 whitespace-nowrap">販売店支払額</th>
            <th className="px-4 py-3 whitespace-nowrap">支払予定日</th>
            <th className="px-4 py-3 whitespace-nowrap">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === selectedId;
            return (
              <tr
                key={row.id}
                className={
                  selected
                    ? "border-b border-gray-100 bg-sky-50/70"
                    : "border-b border-gray-100 last:border-0"
                }
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <PriorityBadge
                    rank={row.priorityRank}
                    label={
                      row.priorityRank === 1
                        ? "高"
                        : row.priorityRank === 2
                          ? "中"
                          : "通常"
                    }
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                  {row.stageLabel}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(row.financeActualDate)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{row.dealerName}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link
                    href={row.caseHref}
                    className="font-medium text-sky-800 hover:underline"
                  >
                    {row.caseNo}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.customerName}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.financeCompany}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {formatYen(row.financeAmount)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {formatYen(
                    row.stage === "needs_settlement"
                      ? row.invoiceTotalAmount
                      : row.veShareAmount
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {formatYen(row.adjustmentTotalAmount)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {formatYen(row.payoutAmount)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(row.scheduledPayoutDate)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onSelect(row.id)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                  >
                    {row.nextActionLabel}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SupplierTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: SupplierPaymentQueueRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        現在、仕入先の支払待ちはありません。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-[#f7f7f5] text-xs font-medium text-gray-500">
          <tr>
            <th className="px-4 py-3 whitespace-nowrap">優先度</th>
            <th className="px-4 py-3 whitespace-nowrap">支払期限</th>
            <th className="px-4 py-3 whitespace-nowrap">仕入先</th>
            <th className="px-4 py-3 whitespace-nowrap">発注番号</th>
            <th className="px-4 py-3 whitespace-nowrap">案件番号</th>
            <th className="px-4 py-3 whitespace-nowrap">顧客名</th>
            <th className="px-4 py-3 whitespace-nowrap">納品日</th>
            <th className="px-4 py-3 whitespace-nowrap">仕入金額</th>
            <th className="px-4 py-3 whitespace-nowrap">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === selectedId;
            return (
              <tr
                key={row.id}
                className={
                  selected
                    ? "border-b border-gray-100 bg-sky-50/70"
                    : "border-b border-gray-100 last:border-0"
                }
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <PriorityBadge
                    rank={row.priorityRank}
                    label={
                      row.isOverdue
                        ? "期限超過"
                        : row.priorityRank === 2
                          ? "期限あり"
                          : "通常"
                    }
                  />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(row.dueDate)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.supplierName}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{row.orderNo}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Link
                    href={row.caseHref}
                    className="font-medium text-sky-800 hover:underline"
                  >
                    {row.caseNo}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.customerName}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(row.deliveredDate)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                  {formatYen(row.amount)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => onSelect(row.id)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                  >
                    支払処理
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ThreePartyActionPanel({
  row,
  onDone,
}: {
  row: ThreePartyPaymentQueueRow;
  onDone: (nextId: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credit, setCredit] = useState(String(row.financeAmount ?? ""));
  const [veShare, setVeShare] = useState(
    String(
      row.invoiceTotalAmount ??
        row.veShareAmount ??
        ""
    )
  );
  const [transferFee, setTransferFee] = useState(
    String(
      row.stage === "needs_settlement"
        ? 0
        : row.adjustmentTotalAmount ?? 0
    )
  );
  const [scheduledPayoutDate, setScheduledPayoutDate] = useState(
    row.scheduledPayoutDate || ""
  );
  const [payDate, setPayDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [payAmount, setPayAmount] = useState(
    String(row.payoutAmount ?? "")
  );

  const preview = calculateDealerSettlementPayout({
    creditReceivedAmount: Number(credit) || 0,
    veShareAmount: Number(veShare) || 0,
    adjustmentLines: [
      { line_kind: "transfer_fee", amount: Number(transferFee) || 0 },
    ],
  });

  async function run(
    action: string,
    resourceId: string | undefined,
    body: Record<string, unknown>,
    nextSelectedId: string | null
  ) {
    setBusy(true);
    setError("");
    const result = await submitThreePartyMoney({
      action,
      caseId: row.caseId,
      resourceId,
      body,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error_message);
      return;
    }
    let selected = nextSelectedId;
    if (
      action === "dealer_settlement.create" &&
      result.resource_id
    ) {
      selected = `${row.caseId}:${row.financeReceiptId}:${result.resource_id}`;
    }
    onDone(selected);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">
            次の操作: {row.nextActionLabel}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {row.caseNo} / {row.dealerName} / {row.stageLabel}
            。確定と支払は別操作です。
          </p>
        </div>
        <Link
          href={row.caseHref}
          className="text-xs font-medium text-sky-800 hover:underline"
        >
          案件詳細を開く
        </Link>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      {row.stage === "needs_finance_confirm" ? (
        <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">信販入金を確認してください</p>
          <p className="text-xs leading-relaxed text-amber-900/90">
            納品済みですが、信販入金（入金済）がまだありません。案件詳細の「請求・入金」タブで信販入金（契約金額）を登録してください。回収管理にも同案件が表示されることがあります（安全網）。
          </p>
          <Link
            href={row.caseHref}
            className="inline-flex rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
          >
            案件詳細で信販入金を確認
          </Link>
        </div>
      ) : null}

      {row.stage === "needs_settlement" ? (
        <div className="mt-4 space-y-4">
          {!row.dealerId ? (
            <p className="text-sm text-rose-700">
              販売店が未設定のため仕切を作成できません。案件詳細で販売店を設定してください。
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField
                  label="信販入金額"
                  value={credit}
                  onChange={setCredit}
                  disabled={busy}
                />
                <NumberField
                  label="VE請求額"
                  value={veShare}
                  onChange={setVeShare}
                  disabled={busy}
                />
                <NumberField
                  label="振込手数料（調整）"
                  value={transferFee}
                  onChange={setTransferFee}
                  disabled={busy}
                />
                <label className="text-xs text-gray-600">
                  支払予定日
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    value={scheduledPayoutDate}
                    disabled={busy}
                    onChange={(e) => setScheduledPayoutDate(e.target.value)}
                  />
                </label>
              </div>
              <PayoutPreview
                credit={Number(credit) || 0}
                ve={Number(veShare) || 0}
                fee={Number(transferFee) || 0}
                payout={preview.payoutAmount}
              />
              <p className="text-xs text-gray-500">
                初期値: 仕切額（御振込）= 信販入金額 − 有効請求額合計。振込手数料は自動控除しません。必要なら調整欄を編集してください。
              </p>
              <button
                type="button"
                disabled={busy || preview.payoutAmount < 0}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                onClick={() =>
                  run(
                    "dealer_settlement.create",
                    undefined,
                    {
                      dealer_id: row.dealerId,
                      finance_receipt_id: row.financeReceiptId,
                      credit_received_amount: Number(credit),
                      ve_share_amount: Number(veShare),
                      scheduled_payout_date: scheduledPayoutDate || null,
                      issue_date: new Date().toISOString().slice(0, 10),
                      lines: [
                        {
                          line_kind: "credit_in",
                          description: "信販会社からの入金",
                          amount: Number(credit) || 0,
                          sort_order: 1,
                        },
                        {
                          line_kind: "ve_share",
                          description: "Value Ecology売上 / 請求額",
                          amount: Number(veShare) || 0,
                          sort_order: 2,
                        },
                        ...(Number(transferFee) > 0
                          ? [
                              {
                                line_kind: "transfer_fee",
                                description: "振込手数料",
                                amount: Number(transferFee) || 0,
                                sort_order: 3,
                              },
                            ]
                          : []),
                      ],
                    },
                    null
                  )
                }
              >
                仕切を下書き作成
              </button>
            </>
          )}
        </div>
      ) : null}

      {row.stage === "needs_confirm" && row.settlementId ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-700">
            金額を固定して確定します。確定後の金額変更は訂正のみです。
          </p>
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Info label="信販入金額" value={formatYen(row.financeAmount)} />
            <Info label="VE請求額" value={formatYen(row.veShareAmount)} />
            <Info label="調整額" value={formatYen(row.adjustmentTotalAmount)} />
            <Info label="販売店支払額" value={formatYen(row.payoutAmount)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              onClick={() =>
                run("dealer_settlement.confirm", row.settlementId!, {}, row.id)
              }
            >
              仕切を確定する
            </button>
            {row.printHref ? (
              <Link
                href={row.printHref}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                仕切清算書を確認
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {row.stage === "needs_pay" && row.settlementId ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-gray-700">
            販売店への実支払を登録します。完了するとこの一覧から消えます。
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-gray-600">
              実支払日
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={payDate}
                disabled={busy}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </label>
            <NumberField
              label="実支払額"
              value={payAmount || String(row.payoutAmount ?? "")}
              onChange={setPayAmount}
              disabled={busy}
            />
          </div>
          <button
            type="button"
            disabled={busy || !payDate}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={() =>
              run(
                "dealer_settlement.pay",
                row.settlementId!,
                {
                  actual_payout_date: payDate,
                  actual_payout_amount: Number(
                    payAmount || row.payoutAmount || 0
                  ),
                },
                null
              )
            }
          >
            支払済にする
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SupplierActionPanel({
  row,
  onDone,
}: {
  row: SupplierPaymentQueueRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payDate, setPayDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState(String(row.amount));

  async function pay() {
    setBusy(true);
    setError("");
    let paymentId = row.supplierPaymentId;
    if (!paymentId) {
      const created = await submitThreePartyMoney({
        action: "supplier_payment.create",
        caseId: row.caseId,
        body: {
          supplier_id: row.supplierId,
          order_id: row.orderId,
          scheduled_amount: Number(amount) || row.amount,
          due_date: row.dueDate,
        },
      });
      if (!created.ok) {
        setBusy(false);
        setError(created.error_message);
        return;
      }
      paymentId = created.resource_id;
    }

    const paid = await submitThreePartyMoney({
      action: "supplier_payment.pay",
      caseId: row.caseId,
      resourceId: paymentId,
      body: {
        paid_date: payDate,
        paid_amount: Number(amount) || row.amount,
      },
    });
    setBusy(false);
    if (!paid.ok) {
      setError(paid.error_message);
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">仕入先 支払処理</h2>
      <p className="mt-1 text-xs text-gray-500">
        {row.supplierName} / {row.orderNo} / 納品日 {formatDate(row.deliveredDate)}
        。支払額初期値は発注 snapshot（order_amount）です。期限の自動計算は行いません。
      </p>
      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          実支払日
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={payDate}
            disabled={busy}
            onChange={(e) => setPayDate(e.target.value)}
          />
        </label>
        <NumberField
          label="支払額"
          value={amount}
          onChange={setAmount}
          disabled={busy}
        />
      </div>
      <button
        type="button"
        disabled={busy || !payDate}
        className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        onClick={() => void pay()}
      >
        支払済にする
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-xs text-gray-600">
      {label}
      <input
        type="number"
        min={0}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-[#f7f7f5] px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="mt-0.5 font-medium tabular-nums text-gray-900">{value}</div>
    </div>
  );
}

function PayoutPreview({
  credit,
  ve,
  fee,
  payout,
}: {
  credit: number;
  ve: number;
  fee: number;
  payout: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 text-sm">
      <div className="flex justify-between border-b border-gray-100 px-3 py-2">
        <span>信販入金額</span>
        <span className="tabular-nums">{formatYen(credit)}</span>
      </div>
      <div className="flex justify-between border-b border-gray-100 px-3 py-2 text-gray-700">
        <span>− VE請求額</span>
        <span className="tabular-nums">{formatYen(ve)}</span>
      </div>
      <div className="flex justify-between border-b border-gray-100 px-3 py-2 text-gray-700">
        <span>− 調整（振込手数料等）</span>
        <span className="tabular-nums">{formatYen(fee)}</span>
      </div>
      <div className="flex justify-between bg-gray-900 px-3 py-3 font-semibold text-white">
        <span>＝ 販売店への支払額</span>
        <span className="tabular-nums">{formatYen(payout)}</span>
      </div>
    </div>
  );
}
