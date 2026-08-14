import assert from "node:assert/strict";

import {
  PERMISSION_CODES,
  PERMISSION_SEED,
  ROLE_CODES,
  ROLE_SEED,
  SCOPE_CODES,
  SCOPE_SEED,
  SCOPE_STRENGTH,
  compareScopeStrength,
  isPermissionCode,
  isRoleCode,
  isScopeCode,
  maxScope,
} from "./rbacCodes";
import {
  assignMembershipRole,
  evaluateMembershipAuthz,
  grantRolePermission,
  scopeCovers,
  type RbacStore,
} from "./rbacCoreLogic";

function ok(name: string) {
  console.log("OK", name);
}

function seedStore(): RbacStore {
  return {
    memberships: [],
    roles: ROLE_SEED.map((r) => ({
      id: r.id,
      code: r.code,
      is_active: true,
    })),
    permissions: PERMISSION_SEED.map((p) => ({
      id: p.id,
      code: p.code,
      is_active: true,
    })),
    scopes: SCOPE_SEED.map((s) => ({
      id: s.id,
      code: s.code,
      is_active: true,
    })),
    rolePermissions: [],
    membershipRoles: [],
  };
}

{
  assert.equal(ROLE_CODES.length, 5);
  assert.equal(PERMISSION_CODES.length, 5);
  assert.equal(SCOPE_CODES.length, 4);
  assert.equal(isRoleCode("SALES"), true);
  assert.equal(isPermissionCode("DELETE"), false);
  assert.equal(isScopeCode("TEAM"), true);
  assert.ok(compareScopeStrength("ALL", "SELF") > 0);
  assert.equal(maxScope(["SELF", "ORGANIZATION", "TEAM"]), "ORGANIZATION");
  assert.equal(SCOPE_STRENGTH.TEAM, 20);
  ok("role/permission/scope code catalogs");
}

{
  const store = seedStore();
  store.memberships.push({
    id: "mem-hq",
    user_id: "user-1",
    organization_id: "org-hq",
    is_active: true,
  });
  store.memberships.push({
    id: "mem-agency",
    user_id: "user-1",
    organization_id: "org-agency",
    is_active: true,
  });

  const admin = ROLE_SEED.find((r) => r.code === "ADMIN")!;
  const sales = ROLE_SEED.find((r) => r.code === "SALES")!;
  const all = SCOPE_SEED.find((s) => s.code === "ALL")!;
  const self = SCOPE_SEED.find((s) => s.code === "SELF")!;

  assert.equal(
    assignMembershipRole(store, {
      id: "mr-1",
      organization_membership_id: "mem-hq",
      role_id: admin.id,
      scope_id: all.id,
    }).ok,
    true
  );
  assert.equal(
    assignMembershipRole(store, {
      id: "mr-2",
      organization_membership_id: "mem-agency",
      role_id: sales.id,
      scope_id: self.id,
    }).ok,
    true
  );

  const dup = assignMembershipRole(store, {
    id: "mr-3",
    organization_membership_id: "mem-hq",
    role_id: admin.id,
    scope_id: self.id,
  });
  assert.equal(dup.ok, false);
  if (dup.ok) throw new Error("expected fail");
  assert.equal(dup.error_code, "DUPLICATE_MEMBERSHIP_ROLE");
  ok("multi-org different roles + duplicate membership role blocked");
}

{
  const store = seedStore();
  store.memberships.push({
    id: "mem-1",
    user_id: "user-1",
    organization_id: "org-1",
    is_active: true,
  });
  const sales = ROLE_SEED.find((r) => r.code === "SALES")!;
  const bo = ROLE_SEED.find((r) => r.code === "BACK_OFFICE")!;
  const orgScope = SCOPE_SEED.find((s) => s.code === "ORGANIZATION")!;
  const self = SCOPE_SEED.find((s) => s.code === "SELF")!;
  const view = PERMISSION_SEED.find((p) => p.code === "VIEW")!;
  const create = PERMISSION_SEED.find((p) => p.code === "CREATE")!;
  const approve = PERMISSION_SEED.find((p) => p.code === "APPROVE")!;

  grantRolePermission(store, {
    id: "rp-1",
    role_id: sales.id,
    permission_id: view.id,
  });
  grantRolePermission(store, {
    id: "rp-2",
    role_id: sales.id,
    permission_id: create.id,
  });
  grantRolePermission(store, {
    id: "rp-3",
    role_id: bo.id,
    permission_id: approve.id,
  });

  assignMembershipRole(store, {
    id: "mr-1",
    organization_membership_id: "mem-1",
    role_id: sales.id,
    scope_id: self.id,
  });
  assignMembershipRole(store, {
    id: "mr-2",
    organization_membership_id: "mem-1",
    role_id: bo.id,
    scope_id: orgScope.id,
  });

  const authz = evaluateMembershipAuthz(store, "mem-1");
  assert.ok(authz);
  assert.deepEqual(authz!.permissionCodes, ["APPROVE", "CREATE", "VIEW"]);
  assert.equal(authz!.maxScopeForPermission("VIEW"), "SELF");
  assert.equal(authz!.maxScopeForPermission("APPROVE"), "ORGANIZATION");
  assert.equal(authz!.coversScope("APPROVE", "SELF"), true);
  assert.equal(authz!.coversScope("VIEW", "ORGANIZATION"), false);
  assert.equal(scopeCovers("ALL", "ORGANIZATION"), true);
  ok("multi-role permission union + scope strength");
}

{
  const store = seedStore();
  store.memberships.push({
    id: "mem-1",
    user_id: "user-1",
    organization_id: "org-1",
    is_active: false,
  });
  const sales = ROLE_SEED.find((r) => r.code === "SALES")!;
  const self = SCOPE_SEED.find((s) => s.code === "SELF")!;
  const view = PERMISSION_SEED.find((p) => p.code === "VIEW")!;
  grantRolePermission(store, {
    id: "rp-1",
    role_id: sales.id,
    permission_id: view.id,
  });
  assignMembershipRole(store, {
    id: "mr-1",
    organization_membership_id: "mem-1",
    role_id: sales.id,
    scope_id: self.id,
  });
  assert.equal(evaluateMembershipAuthz(store, "mem-1"), null);
  ok("inactive membership has no authz");
}

{
  const store = seedStore();
  store.memberships.push({
    id: "mem-1",
    user_id: "user-1",
    organization_id: "org-1",
    is_active: true,
  });
  const sales = ROLE_SEED.find((r) => r.code === "SALES")!;
  store.roles = store.roles.map((r) =>
    r.id === sales.id ? { ...r, is_active: false } : r
  );
  const self = SCOPE_SEED.find((s) => s.code === "SELF")!;
  const view = PERMISSION_SEED.find((p) => p.code === "VIEW")!;
  grantRolePermission(store, {
    id: "rp-1",
    role_id: sales.id,
    permission_id: view.id,
  });
  assignMembershipRole(store, {
    id: "mr-1",
    organization_membership_id: "mem-1",
    role_id: sales.id,
    scope_id: self.id,
  });
  const authz = evaluateMembershipAuthz(store, "mem-1");
  assert.ok(authz);
  assert.deepEqual(authz!.permissionCodes, []);
  ok("inactive role contributes no permissions");
}

{
  const store = seedStore();
  store.memberships.push({
    id: "mem-1",
    user_id: "user-1",
    organization_id: "org-1",
    is_active: true,
  });
  const sales = ROLE_SEED.find((r) => r.code === "SALES")!;
  const self = SCOPE_SEED.find((s) => s.code === "SELF")!;
  const view = PERMISSION_SEED.find((p) => p.code === "VIEW")!;
  store.permissions = store.permissions.map((p) =>
    p.id === view.id ? { ...p, is_active: false } : p
  );
  grantRolePermission(store, {
    id: "rp-1",
    role_id: sales.id,
    permission_id: view.id,
  });
  assignMembershipRole(store, {
    id: "mr-1",
    organization_membership_id: "mem-1",
    role_id: sales.id,
    scope_id: self.id,
  });
  const authz = evaluateMembershipAuthz(store, "mem-1");
  assert.ok(authz);
  assert.equal(authz!.hasPermission("VIEW"), false);
  ok("inactive permission excluded");
}

console.log("rbacCoreLogic.test.ts: all passed");
