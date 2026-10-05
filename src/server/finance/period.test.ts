import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isIsoDate, previousRange, resolveRange } from "./period";

describe("resolveRange", () => {
  // 2026-10-05 is a Monday.
  const today = "2026-10-05";

  it("resolves calendar presets around today", () => {
    expect(resolveRange("today", today)).toEqual({ from: today, to: today });
    expect(resolveRange("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveRange("quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(resolveRange("year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("runs weeks from Saturday to Friday", () => {
    expect(resolveRange("week", today)).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(resolveRange("week", "2026-10-03")).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(resolveRange("week", "2026-10-09")).toEqual({ from: "2026-10-03", to: "2026-10-09" });
  });

  it("handles February in leap and common years", () => {
    expect(resolveRange("month", "2028-02-10").to).toBe("2028-02-29");
    expect(resolveRange("month", "2027-02-10").to).toBe("2027-02-28");
  });

  it("accepts a valid custom range and falls back to the month otherwise", () => {
    expect(resolveRange("custom", today, { from: "2026-01-15", to: "2026-03-10" })).toEqual({ from: "2026-01-15", to: "2026-03-10" });
    const month = { from: "2026-10-01", to: "2026-10-31" };
    expect(resolveRange("custom", today, { from: "2026-03-10", to: "2026-01-15" })).toEqual(month);
    expect(resolveRange("custom", today, { from: "2026-02-30", to: "2026-03-10" })).toEqual(month);
    expect(resolveRange("custom", today)).toEqual(month);
  });
});

describe("date helpers", () => {
  it("adds and counts days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-09-27", "2026-10-05")).toBe(8);
    expect(daysBetween("2026-10-05", "2026-09-27")).toBe(-8);
  });

  it("rejects impossible dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-3")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });

  it("steps whole calendar months back by the same number of months", () => {
    expect(previousRange({ from: "2026-10-01", to: "2026-10-31" })).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousRange({ from: "2026-01-01", to: "2026-03-31" })).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    expect(previousRange({ from: "2028-01-01", to: "2028-12-31" })).toEqual({ from: "2027-01-01", to: "2027-12-31" });
  });

  it("steps other ranges back by their length in days", () => {
    expect(previousRange({ from: "2026-10-05", to: "2026-10-05" })).toEqual({ from: "2026-10-04", to: "2026-10-04" });
    expect(previousRange({ from: "2026-10-03", to: "2026-10-09" })).toEqual({ from: "2026-09-26", to: "2026-10-02" });
  });
});
