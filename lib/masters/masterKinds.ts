export type MasterKind =
  | "dealer"
  | "contractor"
  | "manufacturer"
  | "package";

export const MASTER_KIND_LABELS: Record<MasterKind, string> = {
  dealer: "販売店",
  contractor: "施工店",
  manufacturer: "メーカー",
  package: "パッケージ商品",
};
