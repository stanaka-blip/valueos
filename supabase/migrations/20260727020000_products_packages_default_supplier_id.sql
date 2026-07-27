-- Ver1.0: products / packages に標準仕入先列を追加
-- Additive only. 既存行は NULL のまま（バックフィルしない）。
-- ON DELETE SET NULL: 仕入先削除時に商品・パッケージ行は残し、参照のみ NULL 化する。

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS default_supplier_id uuid;

COMMENT ON COLUMN public.products.default_supplier_id IS
  '標準仕入先（suppliers.id）。案件登録時の仕入先自動解決に使用。NULL可。';

DO $$
DECLARE
  def text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_default_supplier_id_fkey'
      AND conrelid = 'public.products'::regclass
  ) THEN
    SELECT pg_get_constraintdef(c.oid)
      INTO def
    FROM pg_constraint c
    WHERE c.conname = 'products_default_supplier_id_fkey'
      AND c.conrelid = 'public.products'::regclass;

    IF def IS NULL
       OR def !~* 'FOREIGN KEY \(default_supplier_id\) REFERENCES (public\.)?suppliers\(id\)'
    THEN
      RAISE EXCEPTION
        'products_default_supplier_id_fkey exists with unexpected definition: %',
        def;
    END IF;

    IF def !~* 'ON DELETE SET NULL' THEN
      RAISE EXCEPTION
        'products_default_supplier_id_fkey exists but ON DELETE is not SET NULL: %',
        def;
    END IF;

    RAISE NOTICE
      'products_default_supplier_id_fkey already exists; skipping recreate. def=%',
      def;
  ELSE
    ALTER TABLE public.products
      ADD CONSTRAINT products_default_supplier_id_fkey
      FOREIGN KEY (default_supplier_id)
      REFERENCES public.suppliers (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_default_supplier_id_idx
  ON public.products (default_supplier_id);

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS default_supplier_id uuid;

COMMENT ON COLUMN public.packages.default_supplier_id IS
  '標準仕入先（suppliers.id）。案件登録時の仕入先自動解決に使用。NULL可。';

DO $$
DECLARE
  def text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'packages_default_supplier_id_fkey'
      AND conrelid = 'public.packages'::regclass
  ) THEN
    SELECT pg_get_constraintdef(c.oid)
      INTO def
    FROM pg_constraint c
    WHERE c.conname = 'packages_default_supplier_id_fkey'
      AND c.conrelid = 'public.packages'::regclass;

    IF def IS NULL
       OR def !~* 'FOREIGN KEY \(default_supplier_id\) REFERENCES (public\.)?suppliers\(id\)'
    THEN
      RAISE EXCEPTION
        'packages_default_supplier_id_fkey exists with unexpected definition: %',
        def;
    END IF;

    IF def !~* 'ON DELETE SET NULL' THEN
      RAISE EXCEPTION
        'packages_default_supplier_id_fkey exists but ON DELETE is not SET NULL: %',
        def;
    END IF;

    RAISE NOTICE
      'packages_default_supplier_id_fkey already exists; skipping recreate. def=%',
      def;
  ELSE
    ALTER TABLE public.packages
      ADD CONSTRAINT packages_default_supplier_id_fkey
      FOREIGN KEY (default_supplier_id)
      REFERENCES public.suppliers (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS packages_default_supplier_id_idx
  ON public.packages (default_supplier_id);
