# Document Preview Frame Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow same-origin PDF iframe preview by changing global `X-Frame-Options` from `DENY` to `SAMEORIGIN`.

**Architecture:** One-line security header change in `next.config.ts`, covered by a Vitest regression test that imports the Next config and asserts the frame policy value. No UI, auth, or storage changes.

**Tech Stack:** Next.js 16 headers config, Vitest

## Global Constraints

- Change only the frame policy; leave other security headers unchanged.
- Keep clickjacking protection against external sites (`SAMEORIGIN`, not remove the header).
- Do not modify `document-preview.tsx` or `/api/documenti/[id]/file`.
- Follow TDD: failing test first, then the config change.

---

### Task 1: Frame policy SAMEORIGIN

**Files:**
- Create: `src/lib/__tests__/security-headers.test.ts`
- Modify: `next.config.ts:11`

**Interfaces:**
- Consumes: default export `nextConfig` from `next.config.ts` (`headers()` async method)
- Produces: global `X-Frame-Options: SAMEORIGIN` for `source: "/:path*"`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("security headers", () => {
  it("allows same-origin framing for document PDF preview", async () => {
    const headersFn = nextConfig.headers;
    expect(headersFn).toBeTypeOf("function");
    const rules = await headersFn!();
    const globalRule = rules.find((r) => r.source === "/:path*");
    expect(globalRule).toBeDefined();
    const frame = globalRule!.headers.find((h) => h.key === "X-Frame-Options");
    expect(frame?.value).toBe("SAMEORIGIN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/security-headers.test.ts`

Expected: FAIL — received `DENY`, expected `SAMEORIGIN`

- [ ] **Step 3: Write minimal implementation**

In `next.config.ts`, change:

```ts
{ key: "X-Frame-Options", value: "DENY" },
```

to:

```ts
{ key: "X-Frame-Options", value: "SAMEORIGIN" },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/security-headers.test.ts`

Expected: PASS

- [ ] **Step 5: Full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all succeed

- [ ] **Step 6: Commit (only if user asks)**

Do not commit unless the user explicitly requests a commit.
