import { describe, expect, it } from "vitest";
import { buildNotificationDedupeKey } from "./dedupe";

describe("buildNotificationDedupeKey", () => {
  it("returns the same key for repeated delivery attempts", () => {
    const input = {
      recipientUserId: "user-1",
      eventType: "offer.created",
      relatedEntityType: "offer" as const,
      relatedEntityId: "offer-9",
    };

    expect(buildNotificationDedupeKey(input)).toBe(buildNotificationDedupeKey({ ...input }));
  });

  it("keeps recipients isolated", () => {
    const base = {
      eventType: "offer.created",
      relatedEntityType: "offer" as const,
      relatedEntityId: "offer-9",
    };

    expect(buildNotificationDedupeKey({ ...base, recipientUserId: "user-1" })).not.toBe(
      buildNotificationDedupeKey({ ...base, recipientUserId: "user-2" }),
    );
  });

  it("keeps distinct events and related records separate", () => {
    const base = {
      recipientUserId: "user-1",
      relatedEntityType: "offer" as const,
      relatedEntityId: "offer-9",
    };

    expect(buildNotificationDedupeKey({ ...base, eventType: "offer.created" })).not.toBe(
      buildNotificationDedupeKey({ ...base, eventType: "offer.accepted" }),
    );

    expect(buildNotificationDedupeKey({ ...base, relatedEntityId: "offer-10" })).not.toBe(
      buildNotificationDedupeKey({ ...base, relatedEntityId: "offer-9" }),
    );
  });

  it("does not collide when identifiers contain separators", () => {
    const left = buildNotificationDedupeKey({
      recipientUserId: "user:a",
      eventType: "offer.created",
    });
    const right = buildNotificationDedupeKey({
      recipientUserId: "user",
      eventType: "a:offer.created",
    });

    expect(left).not.toBe(right);
  });

  it("requires a complete related-record pair", () => {
    expect(() =>
      buildNotificationDedupeKey({
        recipientUserId: "user-1",
        eventType: "sale.created",
        relatedEntityType: "sale",
      }),
    ).toThrow("relatedEntityType and relatedEntityId must be provided together.");
  });

  it("rejects blank required identifiers", () => {
    expect(() =>
      buildNotificationDedupeKey({
        recipientUserId: " ",
        eventType: "offer.created",
      }),
    ).toThrow("recipientUserId must not be empty.");

    expect(() =>
      buildNotificationDedupeKey({
        recipientUserId: "user-1",
        eventType: " ",
      }),
    ).toThrow("eventType must not be empty.");
  });
});
