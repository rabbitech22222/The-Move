import { beforeEach, describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  canWrite,
} from "../lib/auth";
import { encryptToken, decryptToken } from "../lib/credentials";
import { createOAuthState, verifyOAuthState } from "../lib/oauth";
import { assertSameOrigin } from "../lib/http";
describe("authentication and credential security", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-only-session-key-at-least-32-characters";
    process.env.TOKEN_ENCRYPTION_KEY = "42".repeat(32);
    process.env.APP_URL = "http://localhost:3000";
  });
  it("salts password hashes and rejects wrong password", () => {
    const a = hashPassword("test-passphrase"),
      b = hashPassword("test-passphrase");
    expect(a).not.toEqual(b);
    expect(verifyPassword("test-passphrase", a)).toBe(true);
    expect(verifyPassword("wrong", a)).toBe(false);
    expect(verifyPassword("x", "scrypt:broken:00")).toBe(false);
  });
  it("rejects tampered, expired and malformed sessions", () => {
    const token = signSession("operator-1", 1000);
    expect(verifySession(token, 1001)).toBe("operator-1");
    expect(verifySession(token, 1000 + 12 * 60 * 60 * 1000)).toBeNull();
    expect(verifySession(token + "a", 1001)).toBeNull();
    expect(verifySession(token + ".extra", 1001)).toBeNull();
    expect(verifySession("invalid", 1001)).toBeNull();
  });
  it("viewer role cannot write", () => {
    expect(canWrite("VIEWER")).toBe(false);
    expect(canWrite("OPERATOR")).toBe(true);
    expect(canWrite("ADMIN")).toBe(true);
  });
  it("uses authenticated encryption with fresh nonce and refuses modified tokens", () => {
    const a = encryptToken("not-a-real-provider-token"),
      b = encryptToken("not-a-real-provider-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("not-a-real");
    expect(decryptToken(a)).toBe("not-a-real-provider-token");
    const p = a.split(".");
    p[2] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptToken(p.join("."))).toThrow();
  });
  it("binds OAuth state to operator and nonce", () => {
    const { value, cookie } = createOAuthState("operator-1");
    expect(verifyOAuthState(cookie, value.state, "operator-1").verifier).toBe(
      value.verifier,
    );
    expect(() => verifyOAuthState(cookie, value.state, "operator-2")).toThrow();
    expect(() => verifyOAuthState(cookie, "other", "operator-1")).toThrow();
    expect(() =>
      verifyOAuthState(cookie + "tamper", value.state, "operator-1"),
    ).toThrow();
  });
  it("rejects missing and cross-site origins for changes", () => {
    expect(() =>
      assertSameOrigin(new Request("http://localhost:3000/api/projects")),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000/api/projects", {
          headers: { origin: "https://attacker.invalid" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000/api/projects", {
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
  });
});
