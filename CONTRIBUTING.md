# Contributing to PALEON

PALEON, also called ScriptEcho in package names, helps people investigate historical inscriptions. Its rule is evidence before explanation.

## Setup

You need Node 22.12 or later.

```bash
npm install
npm test
```

`npm test` runs the complete offline suite and spends no money. Read the counts in the output, not only the exit code.

## Rules for changes

- Do not modify `experiments/m0_feasibility` inputs, `prompts/eval_v1.md`, or `docs/ARCHITECTURE.md`.
- Never commit images from a dataset, `.env`, keys, or `.paleon/`.
- Do not invent labels, readings, translations, or accuracy figures. Leave unknown data empty.
- Do not mark anything as expert-reviewed unless a qualified person reviewed it.
- Add a test for each behaviour, and check that it fails when the behaviour is broken.
- Record architecture changes in `docs/DECISIONS.md`, and update the documents they affect.

To add a writing system, follow [docs/ADDING_A_SCRIPT.md](docs/ADDING_A_SCRIPT.md).
