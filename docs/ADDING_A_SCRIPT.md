# Adding a Script

A script joins PALEON through validated data, with no change to core code. Adding only its name to a prompt does nothing useful, because reading needs an inventory.

1. **Add sources** to `knowledge/sources.json`. Read each one first, and use `accessMethod` honestly.
2. **Add the script record** at `knowledge/scripts/<id>.json`. Leave a field `null` if no source supports it.
3. **Add a sign inventory** at `knowledge/sign_inventories/<id>.json`. For a script in Unicode, extend `scripts/build-sign-inventories.py`, so names and code points are generated. Every sign starts as `unreviewed`.
4. **Add a language pack, if one is justified,** at `knowledge/languages/<id>.json`. List forms exactly as sources give them. A script never implies a language (ADR-032).
5. **Run `npm run validate:knowledge`.** The server also refuses to start on invalid data, including a sign with the wrong code point, a scheme falsely marked reversible, or an entry with no source.
6. **Teach it with examples.** Open a case, set the script, confirm clear signs, and use **Teach PALEON this sign**.
7. **Add it to the identification prompt only through a new experiment.** Never edit `experiments/m0_feasibility` or `prompts/eval_v1.md`.

Only a qualified person may set `reviewStatus` to `expert_reviewed`.
