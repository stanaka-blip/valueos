-- Ver1.0: case_packages から PACKAGE 代表行 (case_products) への参照を追加
-- Additive only. 既存行は NULL のまま（バックフィルしない）。
-- ON DELETE SET NULL: 代表行削除時に packages 行は残し、参照のみ NULL 化する。

ALTER TABLE public.case_packages
  ADD COLUMN IF NOT EXISTS case_product_id uuid;

DO $$
DECLARE
  def text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'case_packages_case_product_id_fkey'
      AND conrelid = 'public.case_packages'::regclass
  ) THEN
    SELECT pg_get_constraintdef(c.oid)
      INTO def
    FROM pg_constraint c
    WHERE c.conname = 'case_packages_case_product_id_fkey'
      AND c.conrelid = 'public.case_packages'::regclass;

    IF def IS NULL
       OR def !~* 'FOREIGN KEY \(case_product_id\) REFERENCES (public\.)?case_products\(id\)'
    THEN
      RAISE EXCEPTION
        'case_packages_case_product_id_fkey exists with unexpected definition: %',
        def;
    END IF;

    IF def !~* 'ON DELETE SET NULL' THEN
      RAISE EXCEPTION
        'case_packages_case_product_id_fkey exists but ON DELETE is not SET NULL: %',
        def;
    END IF;

    RAISE NOTICE
      'case_packages_case_product_id_fkey already exists; skipping recreate. def=%',
      def;
  ELSE
    ALTER TABLE public.case_packages
      ADD CONSTRAINT case_packages_case_product_id_fkey
      FOREIGN KEY (case_product_id)
      REFERENCES public.case_products (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS case_packages_case_product_id_idx
  ON public.case_packages (case_product_id);

COMMENT ON COLUMN public.case_packages.case_product_id IS
  '対応する case_products の PACKAGE 代表行ID。既存行はNULL可。ON DELETE SET NULL。';
