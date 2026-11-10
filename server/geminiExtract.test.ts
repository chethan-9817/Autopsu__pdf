import { describe, expect, it } from "vitest";
import { DEFAULT_FALLBACK_MODELS, DEFAULT_MODEL, describeFailure, isKeyProblem, modelChain } from "./geminiExtract.ts";

describe("model fallback chain", () => {
  it("tries the configured model first, then the fallbacks, without duplicates", () => {
    expect(modelChain({ apiKey: "k", model: DEFAULT_MODEL })).toEqual([DEFAULT_MODEL, ...DEFAULT_FALLBACK_MODELS]);
    expect(modelChain({ apiKey: "k", model: "gemini-3.6-flash" })).toEqual(["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
    expect(modelChain({ apiKey: "k", model: "m", fallbackModels: [] })).toEqual(["m"]);
  });

  it("names the reason a model was skipped", () => {
    expect(describeFailure('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}')).toBe(
      "was busy (high demand)",
    );
    expect(describeFailure("429 RESOURCE_EXHAUSTED: quota exceeded")).toBe("was rate-limited");
    expect(describeFailure("The operation was aborted due to timeout")).toBe("was too slow");
    expect(describeFailure('{"error":{"code":504,"message":"Deadline expired before operation could complete.","status":"DEADLINE_EXCEEDED"}}')).toBe("was too slow");
    expect(describeFailure("models/gemini-9-flash is not found for API version v1beta")).toBe("is unavailable");
  });

  it("does not fall back on key problems, which every model would share", () => {
    expect(isKeyProblem("API key not valid. Please pass a valid API key.")).toBe(true);
    expect(isKeyProblem('{"error":{"code":403,"status":"PERMISSION_DENIED"}}')).toBe(true);
    expect(isKeyProblem('{"error":{"code":503,"message":"high demand"}}')).toBe(false);
  });
});
