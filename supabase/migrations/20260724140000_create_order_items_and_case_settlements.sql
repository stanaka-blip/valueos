-- Phase1: order_items / case_settlements
-- Additive only. Does not alter or drop existing tables/data.
-- Apply in Supabase SQL Editor (or `supabase db push`) before using repositories.

-- ---------------------------------------------------------------------------
-- order_items: 仕入発注 (orders) の明細行
-- 既存画面は case_products を明細代わりに参照しているため、
-- 本テーブル追加後も既存データ・既存画面はそのまま動作する。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  case_product_id uuid REFERENCES public.case_products (id) ON DELETE SET NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric,
  amount numeric,
  memo text,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS order_items_product_id_idx
  ON public.order_items (product_id);

CREATE INDEX IF NOT EXISTS order_items_case_product_id_idx
  ON public.order_items (case_product_id);

COMMENT ON TABLE public.order_items IS
  '仕入発注明細。Phase1で追加。既存の orders / case_products は変更しない。';

COMMENT ON COLUMN public.order_items.case_product_id IS
  '案件商品との任意紐付け。移行・照合用。NULL可。';

COMMENT ON COLUMN public.order_items.unit_price IS
  '仕入単価';

COMMENT ON COLUMN public.order_items.amount IS
  '明細金額（通常は quantity × unit_price）';

-- ---------------------------------------------------------------------------
-- case_settlements: 案件ごとの決済条件（1案件1行）
-- Ver1.0: 三社間決済 / 前金 / 掛売 / カード / その他
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid NOT NULL REFERENCES public.cases (id) ON DELETE CASCADE,
  settlement_type text NOT NULL,
  fee_rate numeric,
  fee_amount numeric NOT NULL DEFAULT 0,
  deposit_rate numeric,
  deposit_amount numeric,
  payment_terms text,
  card_brand text,
  memo text,
  CONSTRAINT case_settlements_case_id_key UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS case_settlements_case_id_idx
  ON public.case_settlements (case_id);

CREATE INDEX IF NOT EXISTS case_settlements_settlement_type_idx
  ON public.case_settlements (settlement_type);

COMMENT ON TABLE public.case_settlements IS
  '案件決済条件。Phase1で追加。既存 cases 列は変更しない。';

COMMENT ON COLUMN public.case_settlements.settlement_type IS
  '三社間決済 / 前金 / 掛売 / カード / その他';

COMMENT ON COLUMN public.case_settlements.fee_rate IS
  '決済手数料率（%）';

COMMENT ON COLUMN public.case_settlements.fee_amount IS
  '決済手数料額';

COMMENT ON COLUMN public.case_settlements.deposit_rate IS
  '前金率（%）';

COMMENT ON COLUMN public.case_settlements.deposit_amount IS
  '前金額';

-- ---------------------------------------------------------------------------
-- updated_at 自動更新（新規テーブルのみ）
-- ---------------------------------------------------------------------------
-- 既存の updated_at トリガー関数と衝突しないよう専用名にする
CREATE OR REPLACE FUNCTION public.valueos_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_set_updated_at ON public.order_items;
CREATE TRIGGER order_items_set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();

DROP TRIGGER IF EXISTS case_settlements_set_updated_at ON public.case_settlements;
CREATE TRIGGER case_settlements_set_updated_at
  BEFORE UPDATE ON public.case_settlements
  FOR EACH ROW
  EXECUTE FUNCTION public.valueos_set_updated_at();
-- ---------------------------------------------------------------------------
-- Grants: 既存アプリは publishable(anon) キーで CRUD しているため同等権限を付与
-- RLS は既存テーブル運用に合わせ当面無効（後続で強化可能）
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_settlements TO anon, authenticated;
