# ValueOS

住宅設備商社向け ERP（Next.js + Supabase）。

## Getting Started

```bash
npm run dev
```

既定の開発サーバーは `http://localhost:3001` です（`package.json` の `dev` スクリプト）。

---

## 経営ダッシュボード（Ver1.0）集計基準

画面: `/`（サイドバー「ダッシュボード」）

ダッシュボードは**表示レイヤー**です。発注可否・請求可否・入金状態の業務判定は既存の共通ロジックを再利用し、独自の Workflow / 入金判定は持ちません。

### 表示期間

画面上部の期間（今月 / 先月 / 今年 / 過去12ヶ月 / カスタム）は、次に連動します。

- KPI（売上・実粗利・粗利率）
- 売上推移
- KPI クリック後の案件一覧遷移

未入金額・業務アラートには連動しません。

### KPI

| KPI | 期間連動 | 集計基準 |
|---|---|---|
| 売上 | する | 期間内の **顧客受注日** `cases.order_received_date` を持つ有効案件に紐づく `case_products.sales_price` 合計 |
| 実粗利 | する | 同上案件の `case_products.gross_profit` 合計 |
| 粗利率 | する | 実粗利 ÷ 売上 |
| 未入金額 | **しない** | 現在時点の未回収残高。請求ごとに `summarizeInvoicePayments().unpaidAmount` を合算 |

**受注日の定義:** 顧客が当社へ商品・工事を正式に発注した日。  
仕入先への発注日 `orders.order_date` や、商品明細登録日 `case_products.created_at` は使わない。

キャンセル案件は売上・実粗利の集計対象外（`lib/status/activeRecords.ts`）。

### 売上推移

対象案件の `order_received_date` を日別 / 月別バケットへ振り分け、その案件の商品明細売上・実粗利を合計する。

| 期間プリセット | 粒度 |
|---|---|
| 今月・先月 | 日別 |
| 今年・過去12ヶ月 | 月別 |
| カスタム | 期間長に応じて日別または月別 |

### 業務アラート（現在値・期間非連動）

| アラート | 単位 | 判定 |
|---|---|---|
| 未発注 | 案件 | `WorkflowEngine.canOrder === true` かつ有効発注 0 件 |
| 未請求 | 案件 | `WorkflowEngine.canInvoice === true` かつ有効請求 0 件 |
| 未入金 | **請求** | `summarizeInvoicePayments().paymentStatus` が `未入金` または `一部入金` |
| 期限超過 | **請求** | `summarizeInvoicePayments().isOverdue === true` |

取消・キャンセル除外は `lib/status/activeRecords.ts` の共通関数を利用する。

### ドリルダウン URL

| 起点 | 遷移先 |
|---|---|
| 売上 / 実粗利 / 粗利率 | `/cases?orderReceivedFrom=YYYY-MM-DD&orderReceivedTo=YYYY-MM-DD` |
| 未入金額 / 未入金アラート | `/payments?unpaid=1` |
| 期限超過 | `/payments?overdue=1` |
| 未発注 | `/cases?alert=unordered` |
| 未請求 | `/cases?alert=uninvoiced` |

### 関連マイグレーション

- `supabase/migrations/20260726160000_cases_order_received_date.sql`  
  - `cases.order_received_date` 追加  
  - 既存行は `DATE(created_at)`（Asia/Tokyo）で暫定バックフィル  
- 適用例: `DATABASE_URL='...' node scripts/apply-cases-order-received-date-ddl.mjs`

### 関連テスト

```bash
npm run test:dashboard   # 期間解決 + 受注日基準売上集計
npm run test:payments    # 入金状態判定
npm run test:workflow    # WorkflowEngine
```

---

## 社内認証ゲート（暫定）

ValueOS の社内業務画面は原則すべて暫定の社内パスワードゲートで保護されます（`/dealer/*` 含む。販売店専用 Auth 実装までの暫定）。  
`/login` と `POST /api/auth/login` のみ未認証で利用できます。`/login` にサイドバーは表示しません。  
**Supabase Auth の代替として恒久化しない**想定です。service role key をブラウザへ置かないでください。

### Vercel に設定する環境変数（値はリポジトリへ入れない）

| 変数名 | 用途 | 生成条件 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 既存クライアント用 | Supabase プロジェクト URL |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバーのみ RPC 実行 | Supabase の service_role（`NEXT_PUBLIC_` にしない） |
| `INTERNAL_APP_PASSWORD` | 暫定社内ログイン | 十分な長さの共有パスフレーズ |
| `INTERNAL_AUTH_SECRET` | cookie 署名 | **32文字以上**のランダム秘密（例: `openssl rand -base64 48`） |
| `INTERNAL_APP_ORIGIN` | POST Origin 完全一致 | 例形式: `https://your-app.vercel.app`（末尾スラッシュなし・1値のみ） |

- Production / Preview で Origin が異なる場合は**環境ごとに明示した別値**を設定する（曖昧な複数許可はしない）。
- CSRF は `GET /api/auth/csrf` で再取得する（HttpOnly session 検証後に `csrfToken` のみ返す）。

追加 Migration（人間が適用）:

- `supabase/migrations/20260727010000_gateway_rate_limits.sql`
- `supabase/migrations/20260727010100_gateway_rate_limit_cleanup.sql`

レート制限の古い bucket 掃除:

- アプリが rate limit ヒット時に約5%で `gateway_rate_limit_cleanup(3600, 100)` を opportunistic 実行
- 必要なら SQL Editor から `SELECT public.gateway_rate_limit_cleanup(3600, 500);` を service_role / 管理者で定期実行
- 外部 cron サービスは追加していない（限界: トラフィックが無いと opportunistic が進まない）

---

## 案件添付資料（Direct-to-Storage）

案件登録ウィザードおよび案件詳細「資料」タブから、ファイルを Supabase Storage へ直接アップロードします。  
**ファイル本体は Vercel Route Handler を経由しません**（gateway は intent / complete / signed download のみ）。

| 項目 | 値 |
|---|---|
| Bucket | `case-attachments`（**private**） |
| Path | `cases/{case_id}/{attachment_id}/file.{ext}`（server 生成のみ。表示名は DB に保持） |
| 制限 | 1ファイル 20MB / 1案件 20件 / 合計 100MB |
| 公開 URL | 禁止（短寿命 signed download のみ） |

### 本番適用（コード PR と分離）

1. DB: `supabase/migrations/20260808200000_case_attachments.sql` を人間が適用  
2. Storage: `docs/case-attachments-storage.md` の手順で bucket 作成  

### 関連テスト

```bash
npx tsx lib/caseAttachments/validation.test.ts
node scripts/pr-case-attachments-contract-test.mjs
```

---

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
