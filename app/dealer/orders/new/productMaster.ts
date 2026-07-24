import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ManufacturerOption = {
  id: string;
  name: string;
};

export type SeriesOption = {
  id: string;
  name: string;
  manufacturer_id: string;
};

export type PackageOption = {
  id: string;
  name: string;
  manufacturer_id: string;
  series_id: string | null;
  package_code: string | null;
};

export type ProductOption = {
  id: string;
  name: string;
  model_no: string | null;
  manufacturer_id: string | null;
};

export type PackageItemOption = {
  id: string;
  package_id: string;
  product_id: string;
  quantity: number;
  sort_order: number | null;
  requirement_type: string | null;
  display_name: string | null;
  product_name: string;
  model_no: string | null;
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

export function formatPackageLabel(pkg: PackageOption): string {
  if (pkg.package_code) {
    return `${pkg.name}（${pkg.package_code}）`;
  }
  return pkg.name || "名称未設定";
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

    const { data, error } = await client
      .from("manufacturers")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    return {
      data: (data || []).map((item) => ({
        id: item.id as string,
        name: (item.name as string | null) || "名称未設定",
      })),
      errorMessage: null,
    };
  } catch {
    return { data: [], errorMessage: MASTER_FETCH_ERROR };
  }
}

export async function fetchActiveProductSeries(): Promise<{
  data: SeriesOption[];
  errorMessage: string | null;
}> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    const { data, error } = await client
      .from("product_series")
      .select("id, name, manufacturer_id")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    return {
      data: (data || []).map((item) => ({
        id: item.id as string,
        name: (item.name as string | null) || "名称未設定",
        manufacturer_id: item.manufacturer_id as string,
      })),
      errorMessage: null,
    };
  } catch {
    return { data: [], errorMessage: MASTER_FETCH_ERROR };
  }
}

export async function fetchActivePackages(): Promise<{
  data: PackageOption[];
  errorMessage: string | null;
}> {
  try {
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    const { data, error } = await client
      .from("packages")
      .select("id, name, manufacturer_id, series_id, package_code")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    return {
      data: (data || []).map((item) => ({
        id: item.id as string,
        name: (item.name as string | null) || "名称未設定",
        manufacturer_id: item.manufacturer_id as string,
        series_id: (item.series_id as string | null) || null,
        package_code: (item.package_code as string | null) || null,
      })),
      errorMessage: null,
    };
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

    const { data, error } = await client
      .from("products")
      .select("id, name, model_no, manufacturer_id")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    return {
      data: (data || []).map((item) => ({
        id: item.id as string,
        name: (item.name as string | null) || "名称未設定",
        model_no: (item.model_no as string | null) || null,
        manufacturer_id: (item.manufacturer_id as string | null) || null,
      })),
      errorMessage: null,
    };
  } catch {
    return { data: [], errorMessage: MASTER_FETCH_ERROR };
  }
}

export function getSeriesForManufacturer(
  seriesList: SeriesOption[],
  manufacturerId: string
): SeriesOption[] {
  if (!manufacturerId) {
    return [];
  }

  return seriesList.filter(
    (series) => series.manufacturer_id === manufacturerId
  );
}

export function getPackagesForSelection(params: {
  packages: PackageOption[];
  manufacturerId: string;
  seriesId: string;
}): PackageOption[] {
  const { packages, manufacturerId, seriesId } = params;

  if (!manufacturerId) {
    return [];
  }

  return packages.filter((pkg) => {
    if (pkg.manufacturer_id !== manufacturerId) {
      return false;
    }

    // シリーズ未選択時はメーカー配下の全パッケージ
    if (!seriesId) {
      return true;
    }

    return pkg.series_id === seriesId;
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

export async function fetchPackageItems(
  packageId: string
): Promise<{
  data: PackageItemOption[];
  errorMessage: string | null;
}> {
  if (!packageId) {
    return { data: [], errorMessage: null };
  }

  try {
    const client = getSupabaseClient();
    if (!client) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    const { data, error } = await client
      .from("package_items")
      .select(
        "id, package_id, product_id, quantity, sort_order, requirement_type, display_name, is_hidden, products(id, name, model_no)"
      )
      .eq("package_id", packageId)
      .order("sort_order", { ascending: true });

    if (error) {
      return { data: [], errorMessage: MASTER_FETCH_ERROR };
    }

    const items = (data || [])
      .filter((item) => item.is_hidden !== true)
      .map((item) => {
        const rawProduct = item.products as unknown;
        const product = Array.isArray(rawProduct)
          ? (rawProduct[0] as
              | {
                  id: string;
                  name: string | null;
                  model_no: string | null;
                }
              | undefined)
          : (rawProduct as
              | {
                  id: string;
                  name: string | null;
                  model_no: string | null;
                }
              | null
              | undefined);

        return {
          id: item.id as string,
          package_id: item.package_id as string,
          product_id: item.product_id as string,
          quantity: Number(item.quantity) || 0,
          sort_order: (item.sort_order as number | null) ?? null,
          requirement_type: (item.requirement_type as string | null) || null,
          display_name: (item.display_name as string | null) || null,
          product_name:
            (item.display_name as string | null) ||
            product?.name ||
            "名称未設定",
          model_no: product?.model_no || null,
        };
      });

    return { data: items, errorMessage: null };
  } catch {
    return { data: [], errorMessage: MASTER_FETCH_ERROR };
  }
}

export function formatPackageItemLabel(item: PackageItemOption): string {
  if (item.model_no) {
    return `${item.product_name}（${item.model_no}）`;
  }
  return item.product_name;
}
