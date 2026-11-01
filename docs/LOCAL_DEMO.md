# Local Model Demonstration

> **Version:** 0.1 | **Last updated:** 2026-11-02 | **Status:** Implemented. The image-reading check passed 3 of 3 on generated images on 2026-11-02. **No inscription has been analysed, and the PALEON pipeline has not run on a real model.**

This guide runs genuine inference on this computer through Ollama. It needs no key, account, or payment, and no image leaves the machine.

## Before you start

| Need | For this Mac |
|---|---|
| Model | `qwen2.5vl:3b`, 3.2 GB download |
| Free disk | 11 GiB on 2026-11-02, so the download fits |
| Memory | 8 GB is tight. Close browsers and other large apps. The model took 3.86 GB, with 16 of 37 layers on the GPU |
| Time | 100 to 138 s per simple generated image. A full analysis should take longer, and is unmeasured |

If the model cannot load, try `lfm3-vl`, about 1.7 GB, and set `OLLAMA_MODEL` to match. A different model is a different experiment, so record it.

## Steps

Each command block runs in its own terminal, from the repository root.

**1. Start Ollama in local-only mode.** `OLLAMA_NO_CLOUD=1` disables its cloud features.

```bash
OLLAMA_NO_CLOUD=1 /opt/homebrew/bin/ollama serve
```

**2. Install the model.** This downloads 3.2 GB, once.

```bash
/opt/homebrew/bin/ollama pull qwen2.5vl:3b
```

**3. Show that the model reads images.** It generates three images with random content, and passes only if every answer is correct.

```bash
export PATH=/opt/homebrew/bin:$PATH
set -a; source experiments/local_vlm/local.env; set +a
npm run local:image-check
```

**4. Start PALEON.**

```bash
export PATH=/opt/homebrew/bin:$PATH
set -a; source experiments/local_vlm/local.env; set +a
npm start
```

**5. Open <http://127.0.0.1:8787/investigate>.** The banner must say **Local model**. If it says Demo mode, stop, because that run would be simulated.

**6. Upload an inscription image, and wait.** The first analysis loads the model, which is slow.

**7. On the results page, show:**

- The **Local model result** label.
- Candidates, with evidence for and against, or an abstention.
- Ambiguities and limitations.
- **How this result was produced**, which names the provider, model, and tokens.

**8. Record the run,** with the server still running:

```bash
export PATH=/opt/homebrew/bin:$PATH
set -a; source experiments/local_vlm/local.env; set +a
npm run local:analyze -- path/to/image.jpg
```

## What you can say

| Say | Do not say |
|---|---|
| A local open-weight model analysed this image on this computer | PALEON identifies scripts accurately |
| This is one run, and the answer may be wrong | These are M0 results |
| The image-reading check passed on generated images | The model can read historical inscriptions |

An abstention or a wrong answer is an honest result, so keep it in. Never record demo mode as if it were analysis.

## Troubleshooting

| Message | Meaning |
|---|---|
| Local model server is not running | Start step 1. While Ollama looks for the GPU, it can answer with errors for about 30 seconds, so wait and reload |
| Model is not installed | Run step 2 |
| Could not be loaded | Memory ran out. Close apps, or lower `OLLAMA_NUM_CTX` or `MAX_MODEL_IMAGE_EDGE` |
| Reply was cut off | Raise `OLLAMA_NUM_PREDICT` |
| Disk is full or very low | Swap grows during inference. Stop Ollama, and free disk before trying again |
| The analysis took too long | Raise `MODEL_TIMEOUT_MS` and `ANALYSIS_DEADLINE_MS` |
