import type { CaseFormState } from "./types";

/** 案件登録 STEP1 へコピーする施工店マスタのスナップショット（住所は設置先へ使わない） */
export type ContractorAutofillSource = {
  id: string;
  name: string;
  delivery_name: string | null;
  delivery_address: string | null;
  delivery_phone: string | null;
  receiver_name: string | null;
};

/**
 * 施工店マスタ選択時のフォーム反映。
 * - 施工店名 / 標準納品先名称 / 納品先住所・電話 / 荷受け担当者をコピー
 * - 設置先住所は変更しない
 * - 納品先住所を使うため delivery_same_as_site を false にする
 * - 保存後のマスタ同期は行わない（呼び出し側でスナップショット保存）
 */
export function applyContractorToCaseForm(
  form: CaseFormState,
  contractor: ContractorAutofillSource
): CaseFormState {
  return {
    ...form,
    contractor_name: (contractor.name || "").trim(),
    delivery_name: (contractor.delivery_name || "").trim(),
    delivery_address: (contractor.delivery_address || "").trim(),
    delivery_phone: (contractor.delivery_phone || "").trim(),
    receiver_name: (contractor.receiver_name || "").trim(),
    delivery_same_as_site: false,
  };
}
