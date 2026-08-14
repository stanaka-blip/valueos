/**
 * RBAC Core 純関数（本番 Auth / gateway 未接続）。
 * Membership × Role × Permission × Scope の評価モデル。
 */

import {
  type PermissionCode,
  type RoleCode,
  type ScopeCode,
  maxScope,
} from "./rbacCodes";

export type RbacRole = {
  id: string;
  code: RoleCode;
  is_active: boolean;
};

export type RbacPermission = {
  id: string;
  code: PermissionCode;
  is_active: boolean;
};

export type RbacScope = {
  id: string;
  code: ScopeCode;
  is_active: boolean;
};

export type RbacMembership = {
  id: string;
  user_id: string;
  organization_id: string;
  is_active: boolean;
};

export type RbacMembershipRole = {
  id: string;
  organization_membership_id: string;
  role_id: string;
  scope_id: string;
  is_active: boolean;
};

export type RbacRolePermission = {
  id: string;
  role_id: string;
  permission_id: string;
};

export type RbacStore = {
  memberships: RbacMembership[];
  roles: RbacRole[];
  permissions: RbacPermission[];
  scopes: RbacScope[];
  rolePermissions: RbacRolePermission[];
  membershipRoles: RbacMembershipRole[];
};

export type RbacOpResult<T> =
  | { ok: true; value: T }
  | { ok: false; error_code: string; error_message: string };

function fail<T>(code: string, message: string): RbacOpResult<T> {
  return { ok: false, error_code: code, error_message: message };
}

export function assignMembershipRole(
  store: RbacStore,
  input: {
    id: string;
    organization_membership_id: string;
    role_id: string;
    scope_id: string;
    is_active?: boolean;
  }
): RbacOpResult<RbacMembershipRole> {
  const membership = store.memberships.find(
    (m) => m.id === input.organization_membership_id
  );
  if (!membership) {
    return fail("MEMBERSHIP_NOT_FOUND", "membership が見つかりません");
  }
  const role = store.roles.find((r) => r.id === input.role_id);
  if (!role) return fail("ROLE_NOT_FOUND", "role が見つかりません");
  const scope = store.scopes.find((s) => s.id === input.scope_id);
  if (!scope) return fail("SCOPE_NOT_FOUND", "scope が見つかりません");

  const dup = store.membershipRoles.some(
    (mr) =>
      mr.organization_membership_id === input.organization_membership_id &&
      mr.role_id === input.role_id
  );
  if (dup) {
    return fail(
      "DUPLICATE_MEMBERSHIP_ROLE",
      "同一 membership × role の割当は重複できません"
    );
  }

  const row: RbacMembershipRole = {
    id: input.id,
    organization_membership_id: input.organization_membership_id,
    role_id: input.role_id,
    scope_id: input.scope_id,
    is_active: input.is_active !== false,
  };
  store.membershipRoles.push(row);
  return { ok: true, value: row };
}

export function grantRolePermission(
  store: RbacStore,
  input: { id: string; role_id: string; permission_id: string }
): RbacOpResult<RbacRolePermission> {
  if (!store.roles.some((r) => r.id === input.role_id)) {
    return fail("ROLE_NOT_FOUND", "role が見つかりません");
  }
  if (!store.permissions.some((p) => p.id === input.permission_id)) {
    return fail("PERMISSION_NOT_FOUND", "permission が見つかりません");
  }
  const dup = store.rolePermissions.some(
    (rp) =>
      rp.role_id === input.role_id && rp.permission_id === input.permission_id
  );
  if (dup) {
    return fail(
      "DUPLICATE_ROLE_PERMISSION",
      "同一 role × permission は重複できません"
    );
  }
  const row: RbacRolePermission = {
    id: input.id,
    role_id: input.role_id,
    permission_id: input.permission_id,
  };
  store.rolePermissions.push(row);
  return { ok: true, value: row };
}

export type EffectiveAuthz = {
  permissionCodes: PermissionCode[];
  /** 要求 Permission を満たす Role 割当のうち最大 Scope（なければ null） */
  maxScopeForPermission: (permission: PermissionCode) => ScopeCode | null;
  hasPermission: (permission: PermissionCode) => boolean;
  coversScope: (
    permission: PermissionCode,
    requiredScope: ScopeCode
  ) => boolean;
};

/**
 * 1 Membership の有効権限を評価。
 * inactive membership / role / permission / membership_role / scope は除外。
 */
export function evaluateMembershipAuthz(
  store: RbacStore,
  membershipId: string
): EffectiveAuthz | null {
  const membership = store.memberships.find((m) => m.id === membershipId);
  if (!membership || !membership.is_active) return null;

  const activeGrants = store.membershipRoles.filter((mr) => {
    if (mr.organization_membership_id !== membershipId) return false;
    if (!mr.is_active) return false;
    const role = store.roles.find((r) => r.id === mr.role_id);
    if (!role || !role.is_active) return false;
    const scope = store.scopes.find((s) => s.id === mr.scope_id);
    if (!scope || !scope.is_active) return false;
    return true;
  });

  const permissionCodes = new Set<PermissionCode>();
  const scopesByPermission = new Map<PermissionCode, ScopeCode[]>();

  for (const grant of activeGrants) {
    const scope = store.scopes.find((s) => s.id === grant.scope_id)!;
    const rps = store.rolePermissions.filter(
      (rp) => rp.role_id === grant.role_id
    );
    for (const rp of rps) {
      const perm = store.permissions.find((p) => p.id === rp.permission_id);
      if (!perm || !perm.is_active) continue;
      permissionCodes.add(perm.code);
      const list = scopesByPermission.get(perm.code) || [];
      list.push(scope.code);
      scopesByPermission.set(perm.code, list);
    }
  }

  const sortedPermissions = [...permissionCodes].sort();

  return {
    permissionCodes: sortedPermissions,
    maxScopeForPermission(permission) {
      const scopes = scopesByPermission.get(permission) || [];
      return maxScope(scopes);
    },
    hasPermission(permission) {
      return permissionCodes.has(permission);
    },
    coversScope(permission, requiredScope) {
      return scopeCovers(
        maxScope(scopesByPermission.get(permission) || []),
        requiredScope
      );
    },
  };
}

/** actual が required 以上の可視範囲なら true */
export function scopeCovers(
  actual: ScopeCode | null,
  required: ScopeCode
): boolean {
  if (!actual) return false;
  return maxScope([actual, required]) === actual;
}
