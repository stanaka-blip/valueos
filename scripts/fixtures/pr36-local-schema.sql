-- Isolated schema stub for PR36 RPC tests (not production)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.dealers (
  id uuid PRIMARY KEY,
  name text,
  is_active boolean DEFAULT true,
  default_supplier_id uuid
);

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY,
  name text,
  is_active boolean DEFAULT true
);

CREATE TABLE public.manufacturers (
  id uuid PRIMARY KEY,
  name text
);

CREATE TABLE public.product_series (
  id uuid PRIMARY KEY,
  name text
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  name text,
  model_no text,
  category text,
  product_type text,
  unit text,
  specification text,
  manufacturer_id uuid,
  series_id uuid,
  is_active text DEFAULT 'true'
);

CREATE TABLE public.packages (
  id uuid PRIMARY KEY,
  name text,
  package_code text,
  manufacturer_id uuid REFERENCES public.manufacturers(id),
  series_id uuid REFERENCES public.product_series(id),
  capacity numeric,
  capacity_unit text,
  system_type text,
  warranty_years numeric,
  specification text,
  is_active boolean DEFAULT true
);

CREATE TABLE public.package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid REFERENCES public.packages(id),
  product_id uuid REFERENCES public.products(id),
  quantity numeric,
  requirement_type text,
  selection_group text,
  sort_order int,
  display_name text,
  is_hidden boolean DEFAULT false
);

CREATE TABLE public.sales_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id uuid REFERENCES public.dealers(id),
  product_id uuid,
  sales_price numeric,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  memo text
);

CREATE TABLE public.purchase_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id),
  product_id uuid,
  purchase_price numeric,
  start_date date,
  end_date date,
  is_active boolean DEFAULT true,
  memo text
);

CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  case_no text,
  dealer_id uuid,
  customer_name text,
  customer_phone text,
  site_address text,
  order_type text,
  product_name text,
  quantity numeric,
  order_received_date date,
  desired_delivery_date date,
  delivery_address text,
  construction_desired_date date,
  construction_detail text,
  assigned_user text,
  memo text,
  status text,
  department text,
  priority text
);

CREATE TABLE public.case_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  supplier_id uuid,
  quantity numeric,
  purchase_price numeric,
  sales_price numeric,
  gross_profit numeric,
  memo text
);

CREATE TABLE public.case_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  package_id uuid,
  quantity numeric,
  memo text,
  package_name_snapshot text,
  package_code_snapshot text,
  manufacturer_name_snapshot text,
  series_name_snapshot text,
  capacity_snapshot numeric,
  capacity_unit_snapshot text,
  system_type_snapshot text,
  warranty_years_snapshot numeric,
  specification_snapshot text
);

CREATE TABLE public.case_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_package_id uuid REFERENCES public.case_packages(id) ON DELETE CASCADE,
  product_id uuid,
  source_package_item_id uuid,
  quantity numeric,
  unit_purchase_price numeric,
  total_purchase_price numeric,
  requirement_type text,
  selection_group text,
  product_name_snapshot text,
  model_no_snapshot text,
  display_name_snapshot text,
  product_type_snapshot text,
  category_snapshot text,
  unit_snapshot text,
  specification_snapshot text,
  is_selected boolean,
  is_added_manually boolean,
  is_hidden boolean,
  sort_order int,
  memo text
);

CREATE TABLE public.case_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  case_id uuid UNIQUE REFERENCES public.cases(id) ON DELETE CASCADE,
  settlement_type text,
  fee_rate numeric,
  fee_amount numeric DEFAULT 0,
  deposit_rate numeric,
  deposit_amount numeric,
  payment_terms text,
  card_brand text,
  memo text
);

-- seed
INSERT INTO public.dealers (id, name, is_active)
VALUES ('11111111-1111-1111-1111-111111111111', 'テスト販売店', true);

INSERT INTO public.suppliers (id, name, is_active)
VALUES ('22222222-2222-2222-2222-222222222222', 'テスト仕入先', true);

INSERT INTO public.manufacturers (id, name)
VALUES ('55555555-5555-5555-5555-555555555555', 'メーカーA');

INSERT INTO public.product_series (id, name)
VALUES ('66666666-6666-6666-6666-666666666666', 'シリーズA');

INSERT INTO public.products (id, name, model_no, category, product_type, unit, specification)
VALUES
  ('33333333-3333-3333-3333-333333333333', '商品A', 'A-1', 'cat', 'type', '式', 'spec'),
  ('33333333-3333-3333-3333-333333333334', '商品B', 'B-1', 'cat', 'type', '式', 'spec'),
  ('33333333-3333-3333-3333-333333333335', '構成品C', 'C-1', 'cat', 'type', '式', 'spec');

INSERT INTO public.packages (
  id, name, package_code, manufacturer_id, series_id, capacity, capacity_unit, system_type, warranty_years, specification
) VALUES (
  '44444444-4444-4444-4444-444444444444', 'PKG-A', 'PKG001',
  '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666',
  5.7, 'kWh', 'hybrid', 10, 'pkg-spec'
);

INSERT INTO public.package_items (id, package_id, product_id, quantity, requirement_type, sort_order, display_name, is_hidden)
VALUES (
  '77777777-7777-7777-7777-777777777777',
  '44444444-4444-4444-4444-444444444444',
  '33333333-3333-3333-3333-333333333335',
  2, 'required', 1, '構成C', false
);

-- prices (price_target_type added by migration)
INSERT INTO public.sales_prices (id, dealer_id, product_id, sales_price, start_date, is_active)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 10000, '2026-01-01', true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333334', 5000, '2026-01-01', true);

INSERT INTO public.purchase_prices (id, supplier_id, product_id, purchase_price, start_date, is_active)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 1000, '2026-01-01', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333334', 2000, '2026-01-01', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333335', 500, '2026-01-01', true);
