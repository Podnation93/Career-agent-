import { describe, expect, it } from "vitest";
import { getProvider, HeuristicProvider } from "../ai/provider.js";
import { AnthropicProvider } from "../ai/anthropic.js";

describe("getProvider", () => {
  it("defaults to the heuristic provider", () => {
    expect(getProvider({ AI_PROVIDER: "heuristic" })).toBeInstanceOf(HeuristicProvider);
  });

  it("falls back to heuristic when anthropic is selected but no key is set", () => {
    expect(getProvider({ AI_PROVIDER: "anthropic" })).toBeInstanceOf(HeuristicProvider);
  });

  it("returns the Anthropic provider when a key is configured", () => {
    const provider = getProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-test-key" });
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe("anthropic");
  });

  it("falls back to heuristic for openai (not yet implemented)", () => {
    expect(getProvider({ AI_PROVIDER: "openai", OPENAI_API_KEY: "x" })).toBeInstanceOf(HeuristicProvider);
  });
});
