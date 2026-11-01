import type { Config } from "../config";
import { MockProvider } from "./mock";
import { OllamaProvider } from "./ollama";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import type { ModelProvider } from "./types";

const LOCAL_SEED = 20261102;

export function createProvider(config: Config, fixtureDirectory: string): ModelProvider {
  if (config.provider === "mock") return new MockProvider(fixtureDirectory);
  if (config.provider === "ollama") {
    return new OllamaProvider({ baseUrl: config.ollamaBaseUrl, modelId: config.ollamaModel, numCtx: config.ollamaNumCtx,
      numPredict: config.ollamaNumPredict, keepAlive: config.ollamaKeepAlive, seed: LOCAL_SEED });
  }
  return new OpenAICompatibleProvider({
    id: config.provider,
    baseUrl: config.modelBaseUrl,
    modelId: config.modelId,
    apiKey: config.modelApiKey,
    inputUsdPerMtok: config.inputUsdPerMtok,
    outputUsdPerMtok: config.outputUsdPerMtok,
  });
}
