import { describe, expect, it } from "vitest";
import {
  ContentAttachmentRequestSchema,
  contentAttachmentIdentity,
  parseContentAttachmentRequest,
  requireMatchingContentAttachmentRequest,
} from "../../../shared/pageStudio/content-attachment";
import { PageStudioProvisioningJobSchema } from "../../../server/utils/pageStudio/provisioningBinding";
import fixture from "./fixtures/content-attachment-v1.json";

const request = () => structuredClone(fixture.request);
const axes = [
  "tenantId",
  "clientId",
  "businessId",
  "siteId",
  "environment",
] as const;
const changes = [
  ...axes.map(
    (axis) =>
      [
        `scope.${axis}`,
        axis === "environment" ? "production" : "foreign",
      ] as const
  ),
  ["operationId", "another_operation"],
  ["actor.kind", "client-user"],
  ["actor.userId", "44444444-4444-4444-8444-444444444444"],
  ["actor.loginSessionHash", "e".repeat(64)],
  ["anchor.checkpointId", "other_head"],
  ["anchor.digest", "e".repeat(64)],
  ["schemaDigest", "e".repeat(64)],
  ["runtimeDigest", "e".repeat(64)],
  ["policyVersion", "cms-policy-v2"],
] as const;
function changed(field: string, value: unknown) {
  const input = request();
  const [parent, child] = field.split(".");
  const target = child ? Reflect.get(input, parent) : input;
  Reflect.set(target, child ?? parent, value);
  return input;
}

describe("immutable imported-site CMS attachment contract", () => {
  it("accepts the shared wire fixture without adding or normalizing fields", () => {
    expect(ContentAttachmentRequestSchema.parse(request())).toEqual(
      fixture.request
    );
    expect(parseContentAttachmentRequest(request(), request().scope)).toEqual(
      fixture.request
    );
  });
  it("matches the independently generated cross-repository identity vector", async () => {
    expect(await contentAttachmentIdentity(request())).toBe(fixture.identity);
  });
  it("ignores JSON property order for identity and retained-request comparison", async () => {
    const original = request();
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    reordered.scope = Object.fromEntries(
      Object.entries(original.scope).reverse()
    );
    reordered.actor = Object.fromEntries(
      Object.entries(original.actor).reverse()
    );
    reordered.anchor = Object.fromEntries(
      Object.entries(original.anchor).reverse()
    );
    expect(await contentAttachmentIdentity(reordered)).toBe(fixture.identity);
    expect(
      requireMatchingContentAttachmentRequest(reordered, original)
    ).toEqual(original);
  });
  it.each(changes)(
    "binds identity and exact retry comparison to %s",
    async (field, value) => {
      const other = changed(field, value);
      expect(await contentAttachmentIdentity(other)).not.toBe(fixture.identity);
      expect(() =>
        requireMatchingContentAttachmentRequest(other, request())
      ).toThrow("Attachment request changed");
    }
  );
  it.each(axes)("rejects a request outside the trusted %s", (axis) => {
    const scope = {
      ...request().scope,
      [axis]: axis === "environment" ? "production" : "foreign",
    };
    expect(() => parseContentAttachmentRequest(request(), scope)).toThrow(
      "Attachment scope mismatch"
    );
  });
  it.each([
    ["operationId", "attach_fixture_1\n"],
    ["scope.tenantId", "tenant_demo\n"],
    ["scope.siteId", "site_demo\n"],
    ["anchor.checkpointId", "imported_head\n"],
    ["anchor.digest", `${"b".repeat(64)}\n`],
    ["policyVersion", "cms-policy-v1\n"],
    ["version", 2],
    ["version", "1"],
    ["mode", "generate"],
    ["operationId", ""],
    ["operationId", "a".repeat(129)],
    ["operationId", "../head"],
    ["scope.siteId", "../foreign"],
    ["scope.tenantId", ""],
    ["scope.environment", "dev"],
    ["actor.kind", "admin"],
    ["actor.userId", "untrusted"],
    ["actor.loginSessionHash", undefined],
    ["actor.loginSessionHash", "raw-credential"],
    ["actor.loginSessionHash", "A".repeat(64)],
    ["anchor.checkpointId", ""],
    ["anchor.checkpointId", "../head"],
    ["anchor.checkpointId", "a".repeat(129)],
    ["anchor.digest", "a".repeat(63)],
    ["schemaDigest", "g".repeat(64)],
    ["runtimeDigest", "A".repeat(64)],
    ["policyVersion", ""],
    ["policyVersion", " policy-v1 "],
    ["policyVersion", "a".repeat(129)],
  ])("rejects invalid %s = %s", async (field, value) => {
    const invalid = changed(field, value);
    expect(ContentAttachmentRequestSchema.safeParse(invalid).success).toBe(
      false
    );
    await expect(contentAttachmentIdentity(invalid)).rejects.toThrow();
    expect(() =>
      requireMatchingContentAttachmentRequest(invalid, request())
    ).toThrow();
  });
  it.each(["scope", "actor", "anchor"])(
    "rejects unknown nested fields in %s",
    (field) => {
      expect(
        ContentAttachmentRequestSchema.safeParse(
          changed(`${field}.unexpected`, true)
        ).success
      ).toBe(false);
    }
  );
  it.each(["setup", "plan", "generationVersion", "resources", "unexpected"])(
    "rejects mixed setup or unsupported %s",
    (field) => {
      expect(
        ContentAttachmentRequestSchema.safeParse({ ...request(), [field]: {} })
          .success
      ).toBe(false);
    }
  );
  it("rejects missing required contract fields", () => {
    for (const field of Object.keys(request())) {
      const incomplete = request();
      Reflect.deleteProperty(incomplete, field);
      expect(ContentAttachmentRequestSchema.safeParse(incomplete).success).toBe(
        false
      );
    }
  });
  it("preserves the historical setup job without upgrading it into attachment", () => {
    expect(PageStudioProvisioningJobSchema.parse(fixture.legacy)).toEqual(fixture.legacy);
    expect(
      ContentAttachmentRequestSchema.safeParse(fixture.legacy).success
    ).toBe(false);
    expect(PageStudioProvisioningJobSchema.safeParse(request()).success).toBe(false);
    expect(
      PageStudioProvisioningJobSchema.safeParse({
        ...fixture.legacy,
        mode: "attach-existing-content",
      }).success
    ).toBe(false);
  });
});
