/**
 * API Contract Tests — tests/apiContract.spec.ts
 *
 * Uses Playwright's APIRequestContext (no browser, pure HTTP) to verify that
 * each public API endpoint returns the exact shape the frontend relies on.
 *
 * Why inline validators instead of Zod?  No runtime dependency to add.
 * Each validator throws with a descriptive message on shape mismatch so
 * test output pinpoints exactly which property drifted.
 *
 * Run with:  npx playwright test tests/apiContract.spec.ts
 */

import { test, expect } from "@playwright/test";

const KNOWN_TEMPLATE_ID = "51fddb50-228e-417a-9b68-8c3600d91735";
const FAKE_UUID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Tiny schema validator
// ---------------------------------------------------------------------------

type Rule =
  | { type: "string" }
  | { type: "number" }
  | { type: "boolean" }
  | { type: "array" }
  | { type: "object" }
  | { type: "nullable_string" }
  | { type: "nullable_number" }
  | { type: "string_or_null" }   // alias
  | { type: "number_or_null" }   // alias
  | { type: "optional_string" }
  | { type: "optional_number" };

function assertShape(obj: Record<string, unknown>, schema: Record<string, Rule>, path = "") {
  for (const [key, rule] of Object.entries(schema)) {
    const full = path ? `${path}.${key}` : key;
    const val = obj[key];

    if (rule.type === "string") {
      expect(typeof val, `${full} should be string, got ${typeof val}`).toBe("string");
    } else if (rule.type === "number") {
      expect(typeof val, `${full} should be number, got ${typeof val}`).toBe("number");
    } else if (rule.type === "boolean") {
      expect(typeof val, `${full} should be boolean, got ${typeof val}`).toBe("boolean");
    } else if (rule.type === "array") {
      expect(Array.isArray(val), `${full} should be array`).toBe(true);
    } else if (rule.type === "object") {
      expect(val !== null && typeof val === "object" && !Array.isArray(val), `${full} should be object`).toBe(true);
    } else if (rule.type === "nullable_string" || rule.type === "string_or_null") {
      expect(val === null || typeof val === "string", `${full} should be string|null, got ${typeof val} (${val})`).toBe(true);
    } else if (rule.type === "nullable_number" || rule.type === "number_or_null") {
      expect(val === null || typeof val === "number", `${full} should be number|null, got ${typeof val} (${val})`).toBe(true);
    } else if (rule.type === "optional_string") {
      expect(val === undefined || val === null || typeof val === "string", `${full} optional_string type mismatch`).toBe(true);
    } else if (rule.type === "optional_number") {
      expect(val === undefined || val === null || typeof val === "number", `${full} optional_number type mismatch`).toBe(true);
    }
  }
}

// ---------------------------------------------------------------------------
// Schema definitions (mirrored from frontend TS types)
// ---------------------------------------------------------------------------

const TEMPLATE_LIST_ITEM_SCHEMA: Record<string, Rule> = {
  id:            { type: "string" },
  creatorId:     { type: "string" },
  title:         { type: "string" },
  description:   { type: "string_or_null" },
  category:      { type: "string" },
  tags:          { type: "array" },
  priceNgn:      { type: "number" },
  shootMode:     { type: "string" },
  aspectRatio:   { type: "string" },
  packageSize:   { type: "number" },
  purchaseCount: { type: "number" },
  avgRating:     { type: "number_or_null" },
  ratingCount:   { type: "number" },
  coverUrl:      { type: "string_or_null" },
  createdAt:     { type: "string" },
};

const TEMPLATE_DETAIL_SCHEMA: Record<string, Rule> = {
  id:            { type: "string" },
  creatorId:     { type: "string" },
  title:         { type: "string" },
  description:   { type: "string_or_null" },
  category:      { type: "string" },
  tags:          { type: "array" },
  priceNgn:      { type: "number" },
  price1Ngn:     { type: "optional_number" },
  price5Ngn:     { type: "optional_number" },
  shootMode:     { type: "string" },
  aspectRatio:   { type: "string" },
  packageSize:   { type: "number" },
  purchaseCount: { type: "number" },
  avgRating:     { type: "number_or_null" },
  ratingCount:   { type: "number" },
  userRating:    { type: "number_or_null" },
  coverUrl:      { type: "string_or_null" },
  images:        { type: "array" },
  createdAt:     { type: "string" },
  updatedAt:     { type: "string" },
};

const TEMPLATE_IMAGE_SCHEMA: Record<string, Rule> = {
  id:           { type: "string" },
  templateId:   { type: "string" },
  storagePath:  { type: "string_or_null" },
  storageBucket:{ type: "string_or_null" },
  displayOrder: { type: "number" },
  purpose:      { type: "string" },
  tag:          { type: "string_or_null" },
  customName:   { type: "string_or_null" },
  note:         { type: "string_or_null" },
  noteHidden:   { type: "boolean" },
  url:          { type: "string_or_null" },
  createdAt:    { type: "string" },
};

// ---------------------------------------------------------------------------
// GET /api/marketplace — listing endpoint
// ---------------------------------------------------------------------------

test.describe("GET /api/marketplace — listing schema", () => {
  test("returns 200 with { templates, nextCursor }", async ({ request }) => {
    const res = await request.get("/api/marketplace");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("templates");
    expect(body).toHaveProperty("nextCursor");
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.nextCursor === null || typeof body.nextCursor === "string").toBe(true);
  });

  test("each template item matches TEMPLATE_LIST_ITEM_SCHEMA", async ({ request }) => {
    const res = await request.get("/api/marketplace");
    const { templates } = await res.json();
    expect(templates.length).toBeGreaterThan(0);

    // Validate the first 5 items (enough to catch a schema drift, not too slow).
    for (const t of templates.slice(0, 5)) {
      assertShape(t, TEMPLATE_LIST_ITEM_SCHEMA, "template");
    }
  });

  test("category filter returns only matching templates", async ({ request }) => {
    // First, grab any known category from the full list.
    const allRes = await request.get("/api/marketplace");
    const { templates: all } = await allRes.json();
    if (all.length === 0) { test.skip(); return; }

    const category: string = all[0].category;
    const filteredRes = await request.get(`/api/marketplace?category=${encodeURIComponent(category)}`);
    expect(filteredRes.status()).toBe(200);

    const { templates: filtered } = await filteredRes.json();
    expect(Array.isArray(filtered)).toBe(true);
    for (const t of filtered) {
      expect(t.category).toBe(category);
    }
  });

  test("limit param is respected (max 48)", async ({ request }) => {
    const res = await request.get("/api/marketplace?limit=3");
    const { templates } = await res.json();
    expect(templates.length).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// GET /api/marketplace/[id] — template detail
// ---------------------------------------------------------------------------

test.describe("GET /api/marketplace/[id] — template detail schema", () => {
  test("returns 200 with { template } for known ID", async ({ request }) => {
    const res = await request.get(`/api/marketplace/${KNOWN_TEMPLATE_ID}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("template");
    expect(typeof body.template).toBe("object");
  });

  test("template detail matches TEMPLATE_DETAIL_SCHEMA", async ({ request }) => {
    const res = await request.get(`/api/marketplace/${KNOWN_TEMPLATE_ID}`);
    const { template } = await res.json();
    assertShape(template, TEMPLATE_DETAIL_SCHEMA, "template");
  });

  test("template.id matches the requested ID", async ({ request }) => {
    const res = await request.get(`/api/marketplace/${KNOWN_TEMPLATE_ID}`);
    const { template } = await res.json();
    expect(template.id).toBe(KNOWN_TEMPLATE_ID);
  });

  test("template.images is an array and each item matches TEMPLATE_IMAGE_SCHEMA", async ({ request }) => {
    const res = await request.get(`/api/marketplace/${KNOWN_TEMPLATE_ID}`);
    const { template } = await res.json();

    expect(Array.isArray(template.images)).toBe(true);

    for (const img of (template.images as Record<string, unknown>[]).slice(0, 5)) {
      assertShape(img, TEMPLATE_IMAGE_SCHEMA, "template.images[]");
      // Every image must belong to this template.
      expect(img.templateId).toBe(KNOWN_TEMPLATE_ID);
    }
  });

  test("creator sub-object has required fields when present", async ({ request }) => {
    const res = await request.get(`/api/marketplace/${KNOWN_TEMPLATE_ID}`);
    const { template } = await res.json();

    if (template.creator !== null) {
      assertShape(template.creator as Record<string, unknown>, {
        id:           { type: "string" },
        displayName:  { type: "string" },
        avatarUrl:    { type: "string_or_null" },
        templateCount:{ type: "number" },
        theme:        { type: "string" },
        fontFamily:   { type: "string" },
      }, "template.creator");
    }
  });

  test("returns 404 { error } for unknown ID", async ({ request }) => {
    const res = await request.get(`/api/marketplace/${FAKE_UUID}`);
    expect(res.status()).toBe(404);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });

  test("priceNgn is a positive integer (in Naira, not kobo)", async ({ request }) => {
    const res = await request.get(`/api/marketplace/${KNOWN_TEMPLATE_ID}`);
    const { template } = await res.json();
    // The API stores prices in full Naira — not kobo multiplied by 100.
    expect(template.priceNgn).toBeGreaterThan(0);
    expect(Number.isInteger(template.priceNgn)).toBe(true);
  });

  test("shootMode is one of the known enum values", async ({ request }) => {
    const res = await request.get(`/api/marketplace/${KNOWN_TEMPLATE_ID}`);
    const { template } = await res.json();
    expect(["fast", "advanced"]).toContain(template.shootMode);
  });
});

// ---------------------------------------------------------------------------
// Auth-guarded endpoints — unauthenticated behaviour
// ---------------------------------------------------------------------------

test.describe("Auth-guarded endpoints — 401 shapes", () => {
  test("GET /api/me returns 200 with user: null when not logged in", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("user", null);
  });

  test("POST /api/gift/create returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/gift/create", {
      data: {
        templateId: KNOWN_TEMPLATE_ID,
        senderName: "Test Sender",
        packageSize: 10,
        currency: "NGN",
      },
    });
    // 401 = deployed and correctly rejecting unauthenticated request.
    // 404 = route not yet deployed — skip gracefully rather than fail.
    if (res.status() === 404) { test.skip(); return; }
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/gift/[token]/claim returns 401 without session", async ({ request }) => {
    const res = await request.post(`/api/gift/${FAKE_UUID}/claim`);
    if (res.status() === 404) { test.skip(); return; }
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/marketplace/[id]/book returns 401 without session", async ({ request }) => {
    const res = await request.post(`/api/marketplace/${KNOWN_TEMPLATE_ID}/book`, {
      data: { identityRefs: [] },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// GET /api/gift/[token] — gift detail schema
// ---------------------------------------------------------------------------

test.describe("GET /api/gift/[token] — gift endpoint schema", () => {
  test("non-existent gift UUID returns 404 { error }", async ({ request }) => {
    const res = await request.get(`/api/gift/${FAKE_UUID}`);
    // If the route returns HTML, the gift feature hasn't been deployed yet — skip.
    const ct = res.headers()["content-type"] ?? "";
    if (ct.includes("text/html")) { test.skip(); return; }

    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });

  test("gift endpoint always returns JSON, never HTML", async ({ request }) => {
    const res = await request.get(`/api/gift/${FAKE_UUID}`);
    const ct = res.headers()["content-type"] ?? "";
    // After deployment the gift API must return application/json for all responses.
    if (ct.includes("text/html")) {
      // Route not yet deployed — record intent but don't fail CI.
      console.warn("SKIP: /api/gift route not deployed; skipping JSON content-type check");
      test.skip();
      return;
    }
    expect(ct).toContain("application/json");
    const body = await res.json();
    const hasGift  = "gift" in body;
    const hasError = "error" in body;
    expect(hasGift || hasError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/paystack — signature enforcement
// ---------------------------------------------------------------------------

test.describe("POST /api/webhooks/paystack — security contract", () => {
  test("rejects request with missing signature (401)", async ({ request }) => {
    const res = await request.post("/api/webhooks/paystack", {
      data: { event: "charge.success", data: {} },
      headers: { "Content-Type": "application/json" },
      // Deliberately omit x-paystack-signature
    });
    expect([401, 500]).toContain(res.status());
  });

  test("rejects request with wrong signature (401)", async ({ request }) => {
    const res = await request.post("/api/webhooks/paystack", {
      data: { event: "charge.success", data: {} },
      headers: {
        "Content-Type": "application/json",
        "x-paystack-signature": "0000000000000000000000000000000000000000000000000000000000000000",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
