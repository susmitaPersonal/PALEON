import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoScenarioSchema } from "@scriptecho/contracts";
import { ProviderError, type ModelProvider, type ProviderRequest, type ProviderResponse } from "./types";

const AUTO_SCENARIOS = ["clear_candidate", "ambiguous_candidates", "out_of_scope", "no_writing", "insufficient_evidence"];

type Fixture = { simulated: true; response: unknown };

/** Replays fixed responses and never looks at image content. Results describe the fixture, not the upload. */
export class MockProvider implements ModelProvider {
  readonly id = "mock";
  readonly modelId = "scriptecho-mock";
  readonly simulated = true;
  readonly inputUsdPerMtok = null;
  readonly outputUsdPerMtok = null;

  constructor(private readonly fixtureDirectory: string) {}

  async analyze(request: ProviderRequest): Promise<ProviderResponse> {
    const scenario = this.chooseScenario(request);
    if (scenario === "provider_failure") {
      throw new ProviderError("unavailable", "Simulated provider failure");
    }
    const path = join(this.fixtureDirectory, `${scenario}.json`);
    const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;
    return { content: JSON.stringify(fixture.response), modelVersion: "fixture-v1", usage: null };
  }

  private chooseScenario(request: ProviderRequest): string {
    const requested = DemoScenarioSchema.safeParse(request.demoScenario);
    if (requested.success && requested.data !== "auto") return requested.data;
    // The same image always gets the same fixture, which keeps demos and tests deterministic.
    const digest = createHash("sha256").update(request.image.bytes).digest();
    return AUTO_SCENARIOS[digest[0]! % AUTO_SCENARIOS.length]!;
  }
}
