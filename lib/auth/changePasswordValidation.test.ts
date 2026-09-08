import assert from "node:assert/strict";

import {
  MIN_INVITE_PASSWORD_LENGTH,
  validateNewPassword,
} from "./inviteSession";
import {
  resolveChangePasswordSessionGate,
  validateChangePasswordInput,
} from "./changePasswordValidation";
import type { StaffSession } from "@/lib/gateway/authCookie";

function ok(name: string) {
  console.log("OK", name);
}

{
  assert.equal(
    validateNewPassword({ password: "short", confirm: "short" }) !== null,
    true
  );
  assert.equal(
    validateNewPassword({
      password: "a".repeat(MIN_INVITE_PASSWORD_LENGTH),
      confirm: "b".repeat(MIN_INVITE_PASSWORD_LENGTH),
    }),
    "パスワード確認が一致しません"
  );
  assert.equal(
    validateNewPassword({
      password: "a".repeat(MIN_INVITE_PASSWORD_LENGTH),
      confirm: "a".repeat(MIN_INVITE_PASSWORD_LENGTH),
    }),
    null
  );
  ok("validateNewPassword mismatch and length");
}

{
  const legacySession: StaffSession = {
    sid: "legacy-sid",
    csrf: "csrf",
    exp: Math.floor(Date.now() / 1000) + 3600,
    userId: null,
    email: null,
    displayName: "legacy",
    authMode: "legacy_password",
  };
  const result = resolveChangePasswordSessionGate(legacySession);
  assert.ok(result && result.ok === false);
  if (result && result.ok === false) {
    assert.equal(result.error_code, "LEGACY_UNSUPPORTED");
  }
  ok("legacy session cannot change password");
}

{
  const session: StaffSession = {
    sid: "user-1",
    csrf: "csrf",
    exp: Math.floor(Date.now() / 1000) + 3600,
    userId: "11111111-1111-4111-8111-111111111111",
    email: "staff@example.com",
    displayName: "Staff",
    authMode: "supabase",
  };
  assert.equal(resolveChangePasswordSessionGate(session), null);

  const short = validateChangePasswordInput({
    currentPassword: "current-ok",
    password: "short",
    confirm: "short",
  });
  assert.ok(short && short.ok === false);
  if (short && short.ok === false) {
    assert.equal(short.error_code, "VALIDATION");
  }

  const mismatch = validateChangePasswordInput({
    currentPassword: "current-ok",
    password: "new-password-1",
    confirm: "new-password-2",
  });
  assert.ok(mismatch && mismatch.ok === false);
  if (mismatch && mismatch.ok === false) {
    assert.equal(mismatch.error_code, "VALIDATION");
    assert.match(mismatch.error_message, /一致しません/);
  }

  const missingCurrent = validateChangePasswordInput({
    currentPassword: "",
    password: "new-password-1",
    confirm: "new-password-1",
  });
  assert.ok(missingCurrent && missingCurrent.ok === false);
  if (missingCurrent && missingCurrent.ok === false) {
    assert.equal(missingCurrent.error_code, "VALIDATION");
  }

  const okInput = validateChangePasswordInput({
    currentPassword: "current-ok",
    password: "new-password-1",
    confirm: "new-password-1",
  });
  assert.equal(okInput, null);
  ok("change password input validation");
}

console.log("changePasswordValidation.test.ts passed");
