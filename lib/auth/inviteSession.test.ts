import assert from "node:assert/strict";

import {
  INVITE_LINK_EXPIRED_MESSAGE,
  MIN_INVITE_PASSWORD_LENGTH,
  isInviteOrRecoveryType,
  parseAuthCallbackParams,
  validateNewPassword,
} from "./inviteSession";
import { getStaffInviteRedirectTo, STAFF_SET_PASSWORD_PATH } from "./inviteRedirect";

function ok(name: string) {
  console.log("OK", name);
}

{
  const parsed = parseAuthCallbackParams(
    "",
    "#access_token=at&refresh_token=rt&type=invite"
  );
  assert.equal(parsed.kind, "tokens");
  if (parsed.kind === "tokens") {
    assert.equal(parsed.accessToken, "at");
    assert.equal(parsed.refreshToken, "rt");
    assert.equal(parsed.type, "invite");
  }
  ok("parse implicit invite hash");
}

{
  const parsed = parseAuthCallbackParams(
    "?token_hash=th123&type=recovery",
    ""
  );
  assert.equal(parsed.kind, "otp");
  if (parsed.kind === "otp") {
    assert.equal(parsed.tokenHash, "th123");
    assert.equal(parsed.type, "recovery");
  }
  ok("parse token_hash recovery query");
}

{
  const parsed = parseAuthCallbackParams("?code=abc", "");
  assert.equal(parsed.kind, "code");
  ok("parse pkce code");
}

{
  const parsed = parseAuthCallbackParams(
    "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    ""
  );
  assert.equal(parsed.kind, "error");
  ok("parse expired error query");
}

{
  const parsed = parseAuthCallbackParams("", "");
  assert.equal(parsed.kind, "none");
  ok("parse empty as none");
}

{
  assert.equal(isInviteOrRecoveryType("invite"), true);
  assert.equal(isInviteOrRecoveryType("recovery"), true);
  assert.equal(isInviteOrRecoveryType(null), true);
  assert.equal(isInviteOrRecoveryType("signup"), false);
  ok("invite/recovery type guard");
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
  ok("password validation");
}

{
  assert.equal(STAFF_SET_PASSWORD_PATH, "/auth/set-password");
  assert.equal(getStaffInviteRedirectTo(undefined), null);
  assert.equal(getStaffInviteRedirectTo(""), null);
  assert.equal(
    getStaffInviteRedirectTo("https://valueos-rose.vercel.app"),
    "https://valueos-rose.vercel.app/auth/set-password"
  );
  assert.equal(
    getStaffInviteRedirectTo("https://valueos-rose.vercel.app/"),
    "https://valueos-rose.vercel.app/auth/set-password"
  );
  ok("invite redirect URL");
}

{
  assert.ok(INVITE_LINK_EXPIRED_MESSAGE.includes("有効期限"));
  ok("expired message copy");
}

console.log("All inviteSession tests passed");
