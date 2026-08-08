# Case attachments — Storage bucket（本番適用手順）

コード PR とは**分離**して、人間が本番 / Preview の Supabase プロジェクトで実行する。

## Bucket

| 項目 | 値 |
|---|---|
| Name | `case-attachments` |
| Public | **No**（private） |
| File size limit | `20971520`（20MB） |
| Allowed MIME types | 下記 |

Allowed MIME（推奨）:

```
application/pdf
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
application/vnd.ms-excel
application/vnd.openxmlformats-officedocument.wordprocessingml.document
application/msword
application/vnd.openxmlformats-officedocument.presentationml.presentation
application/vnd.ms-powerpoint
text/csv
image/png
image/jpeg
```

## Dashboard

1. Supabase Dashboard → Storage → New bucket
2. Name: `case-attachments`
3. Public bucket: **off**
4. Restrict MIME types / file size を上記どおり設定
5. Policies: **anon / authenticated に public read/write を付けない**
   - アプリは service_role で signed upload / signed download URL を発行する

## SQL（任意・Dashboard と同等）

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'case-attachments',
  'case-attachments',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
```

Storage RLS: signed URL 経由の upload/download を使うため、anon 向けの広範な INSERT/SELECT policy は**作らない**。

## DB Migration

テーブル定義: `supabase/migrations/20260808200000_case_attachments.sql`  
（こちらも本番 DB へは人間が別途適用）

## Path 規約

`cases/{case_id}/{attachment_id}/{sanitized_filename}`  
クライアント指定禁止。gateway が生成する。
