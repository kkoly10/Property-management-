import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

function block(selector: string) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Missing CSS selector: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function variable(source: string, name: string) {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(source);
  if (!match) throw new Error(`Missing --${name}`);
  return match[1].toUpperCase();
}

function luminance(hex: string) {
  const values = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = values.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Crecy visual foundation", () => {
  const root = block(":root");
  const living = block('[data-crecy-surface="living"]');
  const owner = block('[data-crecy-surface="owner"]');

  it("keeps the founder-approved identity colors exact", () => {
    expect(variable(root, "brand")).toBe("#3A37EB");
    expect(variable(living, "brand")).toBe("#01A065");
    expect(variable(owner, "brand")).toBe("#3A37EB");
  });

  it("does not use the bright Living identity green for normal white-on-green action text", () => {
    const identity = variable(living, "brand");
    const action = variable(living, "action");
    expect(identity).not.toBe(action);
    expect(contrast(identity, "#FFFFFF")).toBeLessThan(4.5);
    expect(contrast(action, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps every surface primary action AA-safe against white text", () => {
    for (const [surface, source] of [["OS", root], ["Living", living], ["Owner", owner]] as const) {
      expect(contrast(variable(source, "action"), "#FFFFFF"), surface).toBeGreaterThanOrEqual(4.5);
    }
  });
});
