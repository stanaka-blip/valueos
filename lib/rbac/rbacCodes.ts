/**
 * ValueOS RBAC Core — Role / Permission / Scope 固定コード。
 * DB seed と同期すること。Magic string を UI へばら撒かない。
 */

export const ROLE_CODES = [
  "ADMIN",
  "MANAGER",
  "SALES",
  "BACK_OFFICE",
  "GENERAL",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_SEED = [
  {
    id: "b1000000-0000-4000-8000-000000000001",
    code: "ADMIN",
    displayName: "管理者",
    sortOrder: 10,
  },
  {
    id: "b1000000-0000-4000-8000-000000000002",
    code: "MANAGER",
    displayName: "マネージャー",
    sortOrder: 20,
  },
  {
    id: "b1000000-0000-4000-8000-000000000003",
    code: "SALES",
    displayName: "営業",
    sortOrder: 30,
  },
  {
    id: "b1000000-0000-4000-8000-000000000004",
    code: "BACK_OFFICE",
    displayName: "BO",
    sortOrder: 40,
  },
  {
    id: "b1000000-0000-4000-8000-000000000005",
    code: "GENERAL",
    displayName: "一般",
    sortOrder: 50,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  code: RoleCode;
  displayName: string;
  sortOrder: number;
}>;

export const PERMISSION_CODES = [
  "VIEW",
  "CREATE",
  "EDIT",
  "APPROVE",
  "EXPORT",
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const PERMISSION_SEED = [
  {
    id: "b2000000-0000-4000-8000-000000000001",
    code: "VIEW",
    displayName: "閲覧",
  },
  {
    id: "b2000000-0000-4000-8000-000000000002",
    code: "CREATE",
    displayName: "作成",
  },
  {
    id: "b2000000-0000-4000-8000-000000000003",
    code: "EDIT",
    displayName: "編集",
  },
  {
    id: "b2000000-0000-4000-8000-000000000004",
    code: "APPROVE",
    displayName: "承認",
  },
  {
    id: "b2000000-0000-4000-8000-000000000005",
    code: "EXPORT",
    displayName: "エクスポート",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  code: PermissionCode;
  displayName: string;
}>;

export const SCOPE_CODES = [
  "SELF",
  "TEAM",
  "ORGANIZATION",
  "ALL",
] as const;

export type ScopeCode = (typeof SCOPE_CODES)[number];

/** 数値が大きいほど広い可視範囲 */
export const SCOPE_STRENGTH: Record<ScopeCode, number> = {
  SELF: 10,
  TEAM: 20,
  ORGANIZATION: 30,
  ALL: 40,
};

export const SCOPE_SEED = [
  {
    id: "b3000000-0000-4000-8000-000000000001",
    code: "SELF",
    displayName: "自分",
    sortOrder: 10,
  },
  {
    id: "b3000000-0000-4000-8000-000000000002",
    code: "TEAM",
    displayName: "チーム",
    sortOrder: 20,
  },
  {
    id: "b3000000-0000-4000-8000-000000000003",
    code: "ORGANIZATION",
    displayName: "組織",
    sortOrder: 30,
  },
  {
    id: "b3000000-0000-4000-8000-000000000004",
    code: "ALL",
    displayName: "全体",
    sortOrder: 40,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  code: ScopeCode;
  displayName: string;
  sortOrder: number;
}>;

export function isRoleCode(value: string | null | undefined): value is RoleCode {
  return !!value && (ROLE_CODES as readonly string[]).includes(value);
}

export function isPermissionCode(
  value: string | null | undefined
): value is PermissionCode {
  return !!value && (PERMISSION_CODES as readonly string[]).includes(value);
}

export function isScopeCode(
  value: string | null | undefined
): value is ScopeCode {
  return !!value && (SCOPE_CODES as readonly string[]).includes(value);
}

export function compareScopeStrength(a: ScopeCode, b: ScopeCode): number {
  return SCOPE_STRENGTH[a] - SCOPE_STRENGTH[b];
}

export function maxScope(scopes: readonly ScopeCode[]): ScopeCode | null {
  if (scopes.length === 0) return null;
  return scopes.reduce((best, cur) =>
    compareScopeStrength(cur, best) > 0 ? cur : best
  );
}
