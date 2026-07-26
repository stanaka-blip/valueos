import {
  SETTLEMENT_RULE_LIST,
  type SettlementRuleKey,
  SETTLEMENT_RULES,
} from "@/lib/workflow/settlementRules";
import type { SettlementRule } from "@/lib/workflow/types";

/** DB / UI の決済区分文字列を SETTLEMENT_RULES キーへ正規化 */
export function resolveSettlementRule(
  settlementType: string | null | undefined
): SettlementRule | null {
  const raw = (settlementType || "").trim();
  if (!raw) return null;

  for (const rule of SETTLEMENT_RULE_LIST) {
    if (rule.aliases.some((alias) => alias === raw)) {
      return rule;
    }
  }

  // キーそのもの
  if (raw in SETTLEMENT_RULES) {
    return SETTLEMENT_RULES[raw as SettlementRuleKey];
  }

  return null;
}
