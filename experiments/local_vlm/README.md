# Local Vision Model Experiment

> **Status:** Image-reading check passed on 2026-11-02, on generated images only. **No inscription has been analysed, and no image has gone through the PALEON pipeline.**

This experiment runs a vision model on this machine through Ollama. **It is separate from M0.** It uses a different model, prompt, image size, and code path. Its results must never be reported as M0 results, and M0's gates do not apply to them.

| File | Purpose |
|---|---|
| `config.yaml` | Planned model, runtime, hardware, and parameters |
| `local.env` | Settings for an 8 GB Apple M1 |
| `records/` | One JSON record per analysis, written by `scripts/local-analyze.mjs` |

Each record holds the image name and hash, model digest and details, Ollama version, hardware, parameters, timing, and the full result. It holds no image bytes.

**What a record shows:** that a local model returned a schema-valid answer. Only `npm run local:image-check` shows that the model read an image. Neither one measures accuracy on historical scripts.

## First real run

`npm run local:image-check`, on a MacBook Air (M1, 8 GB) with Ollama 0.40.3, `qwen2.5vl:3b`, digest `fb90415cde1e`, Q4_K_M, `num_ctx` 8192. Ollama reported 3.8B parameters.

| Shown | Answered | Time |
|---|---|---|
| 4, red | 4, red | 137.7 s, including model load |
| 1, green | 1, green | 107.4 s |
| 8, orange | 8, orange | 99.8 s |

Images were 512 × 512 and generated at run time. The model used 3.86 GB, with 16 of 37 layers on the GPU, or 2.06 GB, and memory free was 16% to 17%. A single reply is about 20 tokens or fewer, so a full PALEON analysis should take longer.

**This shows that the model read these simple images. It says nothing about historical scripts.**

See [LOCAL_DEMO.md](../../docs/LOCAL_DEMO.md) for the steps.
