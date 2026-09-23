# 2026-08-10 release batch — Production Migration 準備

基準 main: `7d895c9d8d1cb67a37a40d3b982f367c99066663`

## 対象 Migration（適用順）

| # | File | 内容 |
|---|------|------|
| 1 | `20260810120000_create_product_bulk_setup_rpc.sql` | 商品一括登録 ledger + RPC |
| 2 | `20260810140000_invoice_line_items.sql` | 請求明細 snapshot テーブル |
| 3 | `20260810150000_three_party_money_events.sql` | 3社間業務テーブル |
| 4 | `20260810160000_three_party_money_request_ledger.sql` | 3社間冪等 ledger |
| 5 | `20260810161000_execute_three_party_money_rpc.sql` | `execute_three_party_money` RPC |

依存:

- 1 と 2 は相互独立（どちらを先にしてもよいが、timestamp 順を推奨）
- 3 → 4 → 5 は必須（5 は 3+4 のテーブルを参照）
- 5 を 3/4 なしで流すと失敗する

## 成果物

| ファイル | 用途 |
|----------|------|
| `01-precheck.sql` | 適用前確認（**SELECT のみ**） |
| `03-postcheck.sql` | 適用後確認（**SELECT のみ**） |
| `README.md` | 本説明 |

適用 SQL は `supabase/migrations/` 原文をそのまま使う（このディレクトリにコピーしない）。

## 手順（適用ターン）

1. 本番 DB で `01-precheck.sql` を実行し結果を保存
2. Stop Conditions に該当しないことを確認
3. Migration 5本を **上記順** で適用（1本ずつ・各後に軽い存在確認推奨）
4. `03-postcheck.sql` を実行
5. Smoke test（アプリ）

## このディレクトリでは禁止

- 本番 Migration の自動実行
- DELETE / UPDATE / TRUNCATE / Storage 削除
- 業務データのバックフィル
- Migration 原文の改変
