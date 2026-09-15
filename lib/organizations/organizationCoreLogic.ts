/**
 * Organization Core の純関数モデル（本番 DB 書込なし）。
 * UNIQUE / inactive 表現などスキーマ契約をユニットテスト可能にする。
 */

export type OrganizationRecord = {
  id: string;
  name: string;
  legal_name: string | null;
  is_active: boolean;
};

export type OrganizationTypeRecord = {
  id: string;
  code: string;
  display_name: string;
  is_active: boolean;
};

export type OrganizationTypeAssignmentRecord = {
  id: string;
  organization_id: string;
  organization_type_id: string;
};

export type OrganizationMembershipRecord = {
  id: string;
  user_id: string;
  organization_id: string;
  is_active: boolean;
};

export type OrganizationCoreStore = {
  organizations: OrganizationRecord[];
  types: OrganizationTypeRecord[];
  assignments: OrganizationTypeAssignmentRecord[];
  memberships: OrganizationMembershipRecord[];
};

export type CoreOpResult<T> =
  | { ok: true; value: T }
  | { ok: false; error_code: string; error_message: string };

function fail<T>(
  error_code: string,
  error_message: string
): CoreOpResult<T> {
  return { ok: false, error_code, error_message };
}

export function createOrganization(
  store: OrganizationCoreStore,
  input: {
    id: string;
    name: string;
    legal_name?: string | null;
    is_active?: boolean;
  }
): CoreOpResult<OrganizationRecord> {
  const name = (input.name || "").trim();
  if (!name) {
    return fail("INVALID_NAME", "組織名は必須です");
  }
  if (store.organizations.some((o) => o.id === input.id)) {
    return fail("DUPLICATE_ORG_ID", "organization id が重複しています");
  }
  const row: OrganizationRecord = {
    id: input.id,
    name,
    legal_name: input.legal_name?.trim() ? input.legal_name.trim() : null,
    is_active: input.is_active !== false,
  };
  store.organizations.push(row);
  return { ok: true, value: row };
}

export function assignOrganizationType(
  store: OrganizationCoreStore,
  input: {
    id: string;
    organization_id: string;
    organization_type_id: string;
  }
): CoreOpResult<OrganizationTypeAssignmentRecord> {
  const org = store.organizations.find((o) => o.id === input.organization_id);
  if (!org) return fail("ORG_NOT_FOUND", "organization が見つかりません");
  const type = store.types.find((t) => t.id === input.organization_type_id);
  if (!type) return fail("TYPE_NOT_FOUND", "organization_type が見つかりません");

  const dup = store.assignments.some(
    (a) =>
      a.organization_id === input.organization_id &&
      a.organization_type_id === input.organization_type_id
  );
  if (dup) {
    return fail(
      "DUPLICATE_TYPE_ASSIGNMENT",
      "同一 organization × type の割当は重複できません"
    );
  }

  const row: OrganizationTypeAssignmentRecord = {
    id: input.id,
    organization_id: input.organization_id,
    organization_type_id: input.organization_type_id,
  };
  store.assignments.push(row);
  return { ok: true, value: row };
}

export function createMembership(
  store: OrganizationCoreStore,
  input: {
    id: string;
    user_id: string;
    organization_id: string;
    is_active?: boolean;
  }
): CoreOpResult<OrganizationMembershipRecord> {
  const org = store.organizations.find((o) => o.id === input.organization_id);
  if (!org) return fail("ORG_NOT_FOUND", "organization が見つかりません");
  if (!input.user_id) {
    return fail("INVALID_USER", "user_id は必須です");
  }

  const dup = store.memberships.some(
    (m) =>
      m.user_id === input.user_id && m.organization_id === input.organization_id
  );
  if (dup) {
    return fail(
      "DUPLICATE_MEMBERSHIP",
      "同一 user × organization の membership は重複できません"
    );
  }

  const row: OrganizationMembershipRecord = {
    id: input.id,
    user_id: input.user_id,
    organization_id: input.organization_id,
    is_active: input.is_active !== false,
  };
  store.memberships.push(row);
  return { ok: true, value: row };
}

export function listActiveMembershipOrganizations(
  store: OrganizationCoreStore,
  userId: string
): OrganizationRecord[] {
  const orgIds = new Set(
    store.memberships
      .filter((m) => m.user_id === userId && m.is_active)
      .map((m) => m.organization_id)
  );
  return store.organizations.filter((o) => orgIds.has(o.id) && o.is_active);
}

export function listTypeCodesForOrganization(
  store: OrganizationCoreStore,
  organizationId: string
): string[] {
  const typeIds = new Set(
    store.assignments
      .filter((a) => a.organization_id === organizationId)
      .map((a) => a.organization_type_id)
  );
  return store.types
    .filter((t) => typeIds.has(t.id))
    .map((t) => t.code)
    .sort();
}
