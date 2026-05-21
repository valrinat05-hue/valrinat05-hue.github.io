import { describe, expect, it } from "vitest";
import { getResetPasswordRedirectUrl, hasRecoveryIntent, stripAuthParamsFromUrl } from "./auth";

describe("auth helpers", () => {
  it("builds the reset redirect from the current origin", () => {
    window.history.replaceState({}, "", "/auth?mode=forgot");

    expect(getResetPasswordRedirectUrl()).toBe(`${window.location.origin}/reset-password`);
  });

  it("detects recovery links from hash tokens", () => {
    expect(
      hasRecoveryIntent({
        search: "",
        hash: "#access_token=test-token&refresh_token=test-refresh&type=recovery",
      }),
    ).toBe(true);
  });

  it("detects recovery links from code query params", () => {
    expect(
      hasRecoveryIntent({
        search: "?code=test-code",
        hash: "",
      }),
    ).toBe(true);
  });

  it("removes auth callback params while preserving unrelated params", () => {
    expect(
      stripAuthParamsFromUrl({
        href: "https://example.com/reset-password?foo=bar&code=test#type=recovery&access_token=token",
        pathname: "/reset-password",
        search: "?foo=bar&code=test",
        hash: "#type=recovery&access_token=token",
      }),
    ).toBe("/reset-password?foo=bar");
  });
});