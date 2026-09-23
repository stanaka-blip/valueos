/**
 * ValueOS Organization Core — 内部固定コードと表示名の対応。
 * DB seed（organization_types）と同期すること。
 */

export const ORGANIZATION_TYPE_CODES = [
  "HEADQUARTERS",
  "AGENCY",
  "CONTRACTOR",
  "TRADING",
] as const;

export type OrganizationTypeCode = (typeof ORGANIZATION_TYPE_CODES)[number];

export const ORGANIZATION_TYPE_SEED = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    code: "HEADQUARTERS",
    displayName: "本社",
    sortOrder: 10,
  },
  {
    id: "a1000000-0000-4000-8000-000000000002",
    code: "AGENCY",
    displayName: "代理店",
    sortOrder: 20,
  },
  {
    id: "a1000000-0000-4000-8000-000000000003",
    code: "CONTRACTOR",
    displayName: "施工店",
    sortOrder: 30,
  },
  {
    id: "a1000000-0000-4000-8000-000000000004",
    code: "TRADING",
    displayName: "商社",
    sortOrder: 40,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  code: OrganizationTypeCode;
  displayName: string;
  sortOrder: number;
}>;

export function isOrganizationTypeCode(
  value: string | null | undefined
): value is OrganizationTypeCode {
  if (!value) return false;
  return (ORGANIZATION_TYPE_CODES as readonly string[]).includes(value);
}

export function displayNameForOrganizationTypeCode(
  code: OrganizationTypeCode
): string {
  const row = ORGANIZATION_TYPE_SEED.find((t) => t.code === code);
  return row?.displayName ?? code;
}
