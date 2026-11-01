export type CheckImage = { truth: { digit: number; colour: string }; base64: string };
export function makeImages(count?: number): Promise<CheckImage[]>;
export function runCheck(options: { baseUrl: string; model: string; images: CheckImage[]; fetchImpl?: typeof fetch; numCtx?: number }): Promise<{
  passed: boolean;
  results: { truth: CheckImage["truth"]; answer: unknown; correct: boolean; ms: number }[];
}>;
