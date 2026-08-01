# case_package_items 価格2列 NULL 許容 hotfix — 本番 DDL

| 項目 | 値 |
|------|-----|
| Migration | `supabase/migrations/20260801120000_case_package_items_prices_nullable.sql` |
| 対象列 | `unit_purchase_price`, `total_purchase_price` |
| 変更内容 | NOT NULL のときだけ `DROP NOT NULL`（既存行非破壊・再実行可） |

## 成果物

| ファイル | 用途 |
|----------|------|
| `01-precheck.sql` | 適用前確認（SELECT のみ） |
| `02-apply.sql` | 適用 SQL（migration 原文とバイト一致） |
| `03-postcheck.sql` | 適用後確認（SELECT のみ） |
| `04-rollback.sql` | 緊急ロールバック手順 |
| `README.md` | 本説明 |

## 安全な適用手順

1. 案件登録 API の一時停止を推奨
2. `01-precheck.sql` を実行し、件数・fingerprint・nullability を保存
3. `02-apply.sql` を実行
4. `03-postcheck.sql` を実行
5. **PASS**
   - 両列 `is_nullable = YES`
   - `case_package_items_fingerprint` が precheck と一致
   - テーブル件数・価格分布が一致
6. 問題時は `04-rollback.sql`（NULL 行が無い場合のみ SET NOT NULL 可）

## 禁止事項

- 業務データの UPDATE/DELETE
- RPC による案件作成（確認目的でも本番では行わない）
- DEFAULT / 権限 / RPC 定義の変更
