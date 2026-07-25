-- Ensure order_items exists and matches anon-key CRUD (same pattern as case_settlements).
-- Additive only.

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

ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_items_anon_all ON public.order_items;
DROP POLICY IF EXISTS order_items_authenticated_all ON public.order_items;

CREATE POLICY order_items_anon_all
  ON public.order_items
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY order_items_authenticated_all
  ON public.order_items
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO service_role;
