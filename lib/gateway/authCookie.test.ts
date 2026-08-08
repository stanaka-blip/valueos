import assert from "node:assert/strict";

process.env.INTERNAL_AUTH_SECRET =
  process.env.INTERNAL_AUTH_SECRET || "test-secret-at-least-32-characters-long!!";

async function main() {
  const {
    createStaffSession,
    sealStaffSession,
    unsealStaffSession,
    sessionActorKey,
    deriveRequestId,
  } = await import("./authCookie");

  function ok(name: string) {
    console.log("OK", name);
  }

  {
    const s = createStaffSession({
      authMode: "supabase",
      userId: "11111111-1111-4111-8111-111111111111",
      email: "tanaka@example.com",
      displayName: "田中 太郎",
    });
    assert.ok(s);
    assert.equal(s!.userId, "11111111-1111-4111-8111-111111111111");
    assert.equal(s!.sid, s!.userId);
    assert.equal(s!.email, "tanaka@example.com");
    assert.equal(s!.displayName, "田中 太郎");
    const sealed = sealStaffSession(s!);
    assert.ok(sealed);
    const again = unsealStaffSession(sealed);
    assert.ok(again);
    assert.equal(again!.displayName, "田中 太郎");
    assert.equal(again!.authMode, "supabase");
    assert.equal(sessionActorKey(again!), again!.userId);
    ok("supabase staff session roundtrip");
  }

  {
    const s = createStaffSession({ authMode: "legacy_password" });
    assert.ok(s);
    assert.equal(s!.userId, null);
    assert.equal(s!.authMode, "legacy_password");
    assert.equal(sessionActorKey(s!), s!.sid);
    ok("legacy session keeps random sid actor");
  }

  {
    const a = deriveRequestId(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    );
    const b = deriveRequestId(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    );
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f-]{36}$/i);
    ok("deriveRequestId v2 stable");
  }

  {
    const legacyLike = createStaffSession({ authMode: "legacy_password" })!;
    const sealed = sealStaffSession({
      sid: legacyLike.sid,
      csrf: legacyLike.csrf,
      exp: legacyLike.exp,
      userId: null,
      email: null,
      displayName: null,
      authMode: "legacy_password",
    });
    const again = unsealStaffSession(sealed);
    assert.ok(again);
    assert.equal(again!.userId, null);
    ok("unseal accepts sessions without user profile fields populated");
  }

  console.log("All authCookie tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
