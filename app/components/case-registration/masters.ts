import { supabase } from "@/lib/supabase";

export type DealerOption = {
  id: string;
  name: string;
  default_supplier_id: string | null;
};

export type ProductOption = {
  id: string;
  name: string;
  model_no: string | null;
};

export type PackageOption = {
  id: string;
  name: string;
  package_code: string | null;
};

export type SupplierOption = {
  id: string;
  name: string;
};

const ERR = "マスタの取得に失敗しました";

function isActiveFlag(value: unknown): boolean {
  return value === true || value === "true";
}

export function formatProductLabel(p: ProductOption): string {
  return p.model_no ? `${p.name}（${p.model_no}）` : p.name;
}

export function formatPackageLabel(p: PackageOption): string {
  return p.package_code ? `${p.name}（${p.package_code}）` : p.name;
}

export async function fetchActiveDealers(): Promise<{
  data: DealerOption[];
  errorMessage: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("dealers")
      .select("id, name, default_supplier_id, is_active")
      .order("name", { ascending: true });
    if (error) return { data: [], errorMessage: ERR };
    return {
      data: (data || [])
        .filter((d) => isActiveFlag(d.is_active) || d.is_active == null)
        .map((d) => ({
          id: d.id as string,
          name: (d.name as string | null) || "名称未設定",
          default_supplier_id: (d.default_supplier_id as string | null) || null,
        })),
      errorMessage: null,
    };
  } catch {
    return { data: [], errorMessage: ERR };
  }
}

export async function fetchActiveProducts(): Promise<{
  data: ProductOption[];
  errorMessage: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, model_no, is_active")
      .order("name", { ascending: true });
    if (error) return { data: [], errorMessage: ERR };
    return {
      data: (data || [])
        .filter((p) => isActiveFlag(p.is_active))
        .map((p) => ({
          id: p.id as string,
          name: (p.name as string | null) || "名称未設定",
          model_no: (p.model_no as string | null) || null,
        })),
      errorMessage: null,
    };
  } catch {
    return { data: [], errorMessage: ERR };
  }
}

export async function fetchActivePackages(): Promise<{
  data: PackageOption[];
  errorMessage: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("packages")
      .select("id, name, package_code, is_active")
      .order("name", { ascending: true });
    if (error) return { data: [], errorMessage: ERR };
    return {
      data: (data || [])
        .filter((p) => isActiveFlag(p.is_active))
        .map((p) => ({
          id: p.id as string,
          name: (p.name as string | null) || "名称未設定",
          package_code: (p.package_code as string | null) || null,
        })),
      errorMessage: null,
    };
  } catch {
    return { data: [], errorMessage: ERR };
  }
}

export async function fetchActiveSuppliers(): Promise<{
  data: SupplierOption[];
  errorMessage: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name, is_active")
      .order("name", { ascending: true });
    if (error) return { data: [], errorMessage: ERR };
    return {
      data: (data || [])
        .filter((s) => isActiveFlag(s.is_active) || s.is_active == null)
        .map((s) => ({
          id: s.id as string,
          name: (s.name as string | null) || "名称未設定",
        })),
      errorMessage: null,
    };
  } catch {
    return { data: [], errorMessage: ERR };
  }
}
