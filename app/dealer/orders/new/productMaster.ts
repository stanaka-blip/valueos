import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ManufacturerOption = {
  id: string;
  name: string;
};

export type ProductOption = {
  id: string;
  name: string;
  model_no: string | null;
  category: string | null;
  manufacturer_id: string | null;
};

const MASTER_FETCH_ERROR = "商品マスタの取得に失敗しました";

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key);
}

export function formatProductLabel(product: ProductOption): string {
  const name = product.name || "名称未設定";
  if (product.model_no) {
    return `${name}（${product.model_no}）`;
  }
  return name;
}

export async function fetchActiveManufacturers(): Promise<{
  data: ManufacturerOption[];
  errorMessage: string | null;
}> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    // Existing master pattern: app/products/new/page.tsx
    const { data, error } = await client
      .from("manufacturers")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    const manufacturers = (data || [])
      .map((item) => ({
        id: item.id as string,
        name: (item.name as string | null) || "名称未設定",
      }))
      .filter((item) => Boolean(item.id));

    return { data: manufacturers, errorMessage: null };
  } catch {
    return { data: [], errorMessage: MASTER_FETCH_ERROR };
  }
}

export async function fetchActiveProducts(): Promise<{
  data: ProductOption[];
  errorMessage: string | null;
}> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    // Existing product columns used across products/cases forms
    const { data, error } = await client
      .from("products")
      .select("id, name, model_no, category, manufacturer_id")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    const products = (data || []).map((item) => ({
      id: item.id as string,
      name: (item.name as string | null) || "名称未設定",
      model_no: (item.model_no as string | null) || null,
      category: (item.category as string | null) || null,
      manufacturer_id: (item.manufacturer_id as string | null) || null,
    }));

    return { data: products, errorMessage: null };
  } catch {
    return { data: [], errorMessage: MASTER_FETCH_ERROR };
  }
}

export function getSeriesOptionsForManufacturer(
  products: ProductOption[],
  manufacturerId: string
): string[] {
  if (!manufacturerId) {
    return [];
  }

  const series = new Set<string>();

  for (const product of products) {
    if (product.manufacturer_id !== manufacturerId) {
      continue;
    }

    const category = product.category?.trim();
    if (category) {
      series.add(category);
    }
  }

  return Array.from(series).sort((a, b) => a.localeCompare(b, "ja"));
}

export function getPackageProducts(params: {
  products: ProductOption[];
  manufacturerId: string;
  series: string;
}): ProductOption[] {
  const { products, manufacturerId, series } = params;

  if (!manufacturerId) {
    return [];
  }

  return products.filter((product) => {
    if (product.manufacturer_id !== manufacturerId) {
      return false;
    }

    if (!series) {
      return true;
    }

    return (product.category || "").trim() === series;
  });
}

export function getPartProducts(params: {
  products: ProductOption[];
  manufacturerId: string;
}): ProductOption[] {
  const { products, manufacturerId } = params;

  if (!manufacturerId) {
    return products;
  }

  return products.filter(
    (product) => product.manufacturer_id === manufacturerId
  );
}
