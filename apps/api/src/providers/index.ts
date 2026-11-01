import type { Config } from "../config";
import { MockProvider } from "./mock";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import type { ModelProvider } from "./types";

export function createProvider(config: Config, fixtureDirectory: string): ModelProvider {
  if (config.provider === "mock") return new MockProvider(fixtureDirectory);
  return new OpenAICompatibleProvider({
    id: config.provider,
    baseUrl: config.modelBaseUrl,
    modelId: config.modelId,
    apiKey: config.modelApiKey,
    inputUsdPerMtok: config.inputUsdPerMtok,
    outputUsdPerMtok: config.outputUsdPerMtok,
  });
}
