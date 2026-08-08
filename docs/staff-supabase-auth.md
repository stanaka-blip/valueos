# 社内ユーザー — Supabase Auth 運用手順

コード PR と分離して、人間が本番 / Preview の Supabase・Vercel で設定する。

## 1. Public signup を OFF

Supabase Dashboard → Authentication → Providers / Settings:

- **Enable email signup（公開セルフ登録）を無効化**
- 必要なら “Allow new users to sign up” を OFF
- Email provider は ON（invite / 管理者作成のため）

アプリに「新規会員登録」画面は無い。

## 2. Site URL / Redirect URLs（Production 前提）

Dashboard → Authentication → URL Configuration:

| 項目 | 値 |
|---|---|
| **Site URL** | `https://valueos-rose.vercel.app` |
| **Redirect URLs** | `https://valueos-rose.vercel.app/auth/set-password` を含める。Preview 利用時は `https://*-*.vercel.app/auth/set-password` 等を追加 |

招待・recovery の `redirectTo` はアプリ側で  
`{INTERNAL_APP_ORIGIN}/auth/set-password`  
（Production では `https://valueos-rose.vercel.app/auth/set-password`）を渡す。

公開セルフ signup 画面は追加しない（invite-only 維持）。

## 3. 社内ユーザーを作成 / 招待

Dashboard → Authentication → Users:

1. **Invite user**（推奨）または Add user
2. メールアドレスを入力
3. 招待メールのリンク → `/auth/set-password` で初回パスワード設定 → `/login` でログイン

または Admin API（service_role・サーバーのみ）で `inviteUserByEmail`（`redirectTo` に set-password URL）。

期限切れ / 不正なリンクでは「招待リンクの有効期限が切れています」を表示する。

## 4. staff_profiles に display_name を設定

Migration `20260808220000_staff_profiles_and_attachment_actors.sql` 適用後:

```sql
-- auth.users.id を確認してから実行
INSERT INTO public.staff_profiles (id, display_name, is_active)
VALUES (
  '<auth-user-uuid>',
  '田中 太郎',
  true
)
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    is_active = EXCLUDED.is_active;
```

- `email` は `auth.users` が正式値（profiles には保存しない）
- `is_active = false` にすると ValueOS 利用不可

## 5. 初回ログイン確認

1. 招待メール → `/auth/set-password` でパスワード設定
2. `/login` でメール + 設定したパスワード
3. サイドバーに「ログイン中：表示名 / email」が出ること
4. ログアウトできること
5. inactive ユーザーはログインできない / 利用できないこと
6. 期限切れリンクで有効期限メッセージが出ること

## 6. Vercel 環境変数

| 変数 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth / 既存クライアント |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth signIn（browser に出るのは publishable のみ） |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only**（profiles 参照等） |
| `INTERNAL_AUTH_SECRET` | staff cookie 署名（32文字以上） |
| `INTERNAL_APP_ORIGIN` | Origin 完全一致 |
| `ALLOW_LEGACY_STAFF_PASSWORD` | 緊急時のみ `true`。共有パスワード経路 |
| `INTERNAL_APP_PASSWORD` | legacy 経路用。本番 Auth 安定後は削除予定 |

`SUPABASE_SERVICE_ROLE_KEY` を `NEXT_PUBLIC_` にしないこと。

## 7. 共有パスワード移行

1. Auth + profiles で社内メンバーがログインできることを確認
2. `ALLOW_LEGACY_STAFF_PASSWORD` を未設定 / false にする
3. `INTERNAL_APP_PASSWORD` を削除

legacy 経路は UI に出さず、API で `legacySharedPassword: true` が必要な明示オプトイン。
