import assert from "node:assert/strict";

import {
  ORGANIZATION_TYPE_CODES,
  ORGANIZATION_TYPE_SEED,
  displayNameForOrganizationTypeCode,
  isOrganizationTypeCode,
} from "./organizationTypeCodes";
import {
  assignOrganizationType,
  createMembership,
  createOrganization,
  listActiveMembershipOrganizations,
  listTypeCodesForOrganization,
  type OrganizationCoreStore,
} from "./organizationCoreLogic";

function seedStore(): OrganizationCoreStore {
  return {
    organizations: [],
    types: ORGANIZATION_TYPE_SEED.map((t) => ({
      id: t.id,
      code: t.code,
      display_name: t.displayName,
      is_active: true,
    })),
    assignments: [],
    memberships: [],
  };
}

function ok(name: string) {
  console.log("OK", name);
}

{
  assert.equal(ORGANIZATION_TYPE_CODES.length, 4);
  assert.deepEqual([...ORGANIZATION_TYPE_CODES], [
    "HEADQUARTERS",
    "AGENCY",
    "CONTRACTOR",
    "TRADING",
  ]);
  assert.equal(ORGANIZATION_TYPE_SEED.length, 4);
  assert.equal(displayNameForOrganizationTypeCode("AGENCY"), "代理店");
  assert.equal(isOrganizationTypeCode("AGENCY"), true);
  assert.equal(isOrganizationTypeCode("DEALER"), false);
  ok("organization type codes are fixed four values");
}

{
  const store = seedStore();
  const org = createOrganization(store, {
    id: "org-1",
    name: "株式会社ABC",
    legal_name: "株式会社エービーシー",
  });
  assert.equal(org.ok, true);
  if (!org.ok) throw new Error("expected ok");
  assert.equal(org.value.name, "株式会社ABC");
  assert.equal(org.value.legal_name, "株式会社エービーシー");
  assert.equal(org.value.is_active, true);
  ok("organization create");
}

{
  const store = seedStore();
  const blank = createOrganization(store, { id: "org-x", name: "  " });
  assert.equal(blank.ok, false);
  if (blank.ok) throw new Error("expected fail");
  assert.equal(blank.error_code, "INVALID_NAME");
  ok("organization rejects empty name");
}

{
  const store = seedStore();
  createOrganization(store, { id: "org-1", name: "株式会社ABC" });
  const agency = ORGANIZATION_TYPE_SEED.find((t) => t.code === "AGENCY")!;
  const contractor = ORGANIZATION_TYPE_SEED.find(
    (t) => t.code === "CONTRACTOR"
  )!;

  const a1 = assignOrganizationType(store, {
    id: "asg-1",
    organization_id: "org-1",
    organization_type_id: agency.id,
  });
  const a2 = assignOrganizationType(store, {
    id: "asg-2",
    organization_id: "org-1",
    organization_type_id: contractor.id,
  });
  assert.equal(a1.ok, true);
  assert.equal(a2.ok, true);
  assert.deepEqual(listTypeCodesForOrganization(store, "org-1"), [
    "AGENCY",
    "CONTRACTOR",
  ]);

  const dup = assignOrganizationType(store, {
    id: "asg-3",
    organization_id: "org-1",
    organization_type_id: agency.id,
  });
  assert.equal(dup.ok, false);
  if (dup.ok) throw new Error("expected fail");
  assert.equal(dup.error_code, "DUPLICATE_TYPE_ASSIGNMENT");
  ok("multi type assignment + duplicate prevention");
}

{
  const store = seedStore();
  createOrganization(store, { id: "org-a", name: "本社" });
  createOrganization(store, { id: "org-b", name: "代理店X" });
  createOrganization(store, {
    id: "org-c",
    name: "無効組織",
    is_active: false,
  });

  const userId = "11111111-1111-4111-8111-111111111111";
  assert.equal(
    createMembership(store, {
      id: "m1",
      user_id: userId,
      organization_id: "org-a",
    }).ok,
    true
  );
  assert.equal(
    createMembership(store, {
      id: "m2",
      user_id: userId,
      organization_id: "org-b",
    }).ok,
    true
  );
  assert.equal(
    createMembership(store, {
      id: "m3",
      user_id: userId,
      organization_id: "org-c",
    }).ok,
    true
  );

  const activeOrgs = listActiveMembershipOrganizations(store, userId);
  assert.deepEqual(
    activeOrgs.map((o) => o.id).sort(),
    ["org-a", "org-b"]
  );

  const dup = createMembership(store, {
    id: "m4",
    user_id: userId,
    organization_id: "org-a",
  });
  assert.equal(dup.ok, false);
  if (dup.ok) throw new Error("expected fail");
  assert.equal(dup.error_code, "DUPLICATE_MEMBERSHIP");
  ok("multi org membership + duplicate prevention");
}

{
  const store = seedStore();
  createOrganization(store, { id: "org-1", name: "Active Org" });
  const userId = "22222222-2222-4222-8222-222222222222";
  createMembership(store, {
    id: "m1",
    user_id: userId,
    organization_id: "org-1",
    is_active: false,
  });
  assert.deepEqual(listActiveMembershipOrganizations(store, userId), []);
  const row = store.memberships[0];
  assert.equal(row.is_active, false);
  ok("inactive membership is expressible and excluded from active list");
}

{
  const store = seedStore();
  createOrganization(store, {
    id: "org-1",
    name: "Inactive Org",
    is_active: false,
  });
  assert.equal(store.organizations[0].is_active, false);
  ok("inactive organization is expressible");
}

console.log("organizationCoreLogic.test.ts: all passed");
