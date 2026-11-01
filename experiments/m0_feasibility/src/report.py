"""Render metrics into a Markdown report and a confusion matrix image."""
import json
from pathlib import Path

from .metrics import PREDICTED_COLUMNS

LIMITATIONS = (
    "These are preliminary engineering gates on a small development dataset, not evidence of general accuracy.\n\n"
    "- Images are a convenience sample, so results do not represent historical writing systems worldwide.\n"
    "- Per-script figures rest on about five images each and are descriptive only.\n"
    "- Single-source classes, printed plates, and famous objects may let a model use cues other than the script.\n"
    "- Excerpts are reported apart from complete samples, and support script identification only.\n"
    "- Prompts tuned on this set make it unusable as independent evaluation.\n"
    "- No 88% accuracy claim can be made from this experiment.\n"
)
CI_NOTE = (
    "Intervals are 95% Wilson intervals on the image counts. They describe sampling uncertainty only, and assume "
    "independent images drawn from a stable population, which this convenience sample is not. They do not cover "
    "label errors, source bias, or memorization, so the true uncertainty is wider. Repetitions do not add evidence: "
    "the sample size is the number of images."
)
SYNTHETIC_BANNER = "> **SYNTHETIC FIXTURE DATA. These numbers exercise the code and say nothing about any model.**\n\n"


def _ratio(block: dict) -> str:
    if block["rate"] is None:
        return "n/a"
    low, high = block["ci95"]
    return f"{block['k']}/{block['n']} ({block['rate']:.1%}; 95% CI {low:.1%} to {high:.1%})"


def confusion_rows(confusion: dict) -> tuple[list[str], list[str], list[list[int]]]:
    columns = [c for c in PREDICTED_COLUMNS if any(row.get(c) for row in confusion.values())]
    labels = sorted(confusion)
    return labels, columns, [[confusion[label].get(c, 0) for c in columns] for label in labels]


def confusion_markdown(confusion: dict) -> str:
    labels, columns, cells = confusion_rows(confusion)
    lines = ["| Gold \\ Predicted | " + " | ".join(columns) + " |", "|---" * (len(columns) + 1) + "|"]
    lines += [f"| {label} | " + " | ".join(map(str, row)) + " |" for label, row in zip(labels, cells)]
    return "\n".join(lines)


def save_confusion_png(confusion: dict, path: Path, title: str) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    labels, columns, cells = confusion_rows(confusion)
    figure, axes = plt.subplots(figsize=(max(6, len(columns) * 1.1), max(4, len(labels) * 0.6)))
    axes.imshow(cells, cmap="Blues")
    axes.set_xticks(range(len(columns)), columns, rotation=45, ha="right")
    axes.set_yticks(range(len(labels)), labels)
    axes.set_xlabel("Predicted")
    axes.set_ylabel("Gold label")
    axes.set_title(title)
    for y, row in enumerate(cells):
        for x, value in enumerate(row):
            if value:
                axes.text(x, y, str(value), ha="center", va="center")
    figure.tight_layout()
    figure.savefig(path, dpi=150)
    plt.close(figure)


def render_report(metrics: dict, run_id: str, synthetic: bool, context: dict | None = None) -> str:
    first, after, stats = metrics["first_attempt"], metrics["after_retry"], metrics["attempts"]
    lines = [f"# Results: {run_id}\n", SYNTHETIC_BANNER if synthetic else ""]
    if context:
        lines += ["## Run\n"] + [f"- {key}: `{value}`" for key, value in context.items()] + [""]

    lines += ["## Measured results\n", "| Metric | First attempt | After retries |", "|---|---|---|"]
    for key, name in [("top1", "Top-1 accuracy"), ("top3", "Top-3 recall"), ("coverage", "Coverage"),
                      ("rejection", "Rejection"), ("strict_rejection", "Strict rejection"),
                      ("rejection_consistency", "Rejection consistency (all repetitions abstain)"),
                      ("reproducibility_in_scope", "Reproducibility, in-scope"),
                      ("reproducibility_rejection", "Reproducibility, rejection images")]:
        lines.append(f"| {name} | {_ratio(first[key])} | {_ratio(after[key])} |")

    lines += ["\n## Gates (after retries)\n", "| Gate | Result | Required | Threshold | Passed |", "|---|---|---|---|---|"]
    for name, gate in metrics["decision"]["gates"].items():
        lines.append(f"| {name} | {_ratio(gate)} | {gate['required']}/{gate['n']} | {gate['threshold']:.0%} "
                     f"| {'yes' if gate['passed'] else 'NO'} |")
    lines += ["\n### About the confidence intervals\n", CI_NOTE]

    lines += ["\n## Per script (after retries)\n", "| Script | Precision | Recall |", "|---|---|---|"]
    for script, block in after["per_script"].items():
        lines.append(f"| {script} | {_ratio(block['precision'])} | {_ratio(block['recall'])} |")

    lines += ["\n## Rejection by class (after retries)\n", "| Class | Rejected |", "|---|---|"]
    for label, block in after["rejection_by_class"].items():
        lines.append(f"| {label} | {_ratio(block)} |")

    lines += ["\n## Subgroups, in-scope (after retries)\n", "| Group | Top-1 | Top-3 |", "|---|---|---|"]
    for name, block in metrics["subgroups"].items():
        lines.append(f"| {name} | {_ratio(block['top1'])} | {_ratio(block['top3'])} |")

    lines += ["\n## Confusion matrix (after retries)\n", confusion_markdown(after["confusion"])]

    lines += [
        "\n## Reliability\n",
        "| Measure | Count |", "|---|---|",
        f"| Attempts | {stats['attempts']} |",
        f"| Provider failures, attempts | {stats['provider_failed_attempts']} |",
        f"| Provider failure kinds | {stats['api_failure_kinds']} |",
        f"| Malformed responses, attempts | {stats['malformed_attempts']} |",
        f"| Successful provider retries | {stats['successful_provider_retries']} |",
        f"| Successful repair retries | {stats['successful_repair_retries']} |",
        f"| Provider retries exhausted | {stats['provider_retries_exhausted']} |",
        f"| Repair retries exhausted | {stats['repair_retries_exhausted']} |",
        f"| Repetitions lost to provider failures | {stats['repetitions_lost_to_provider']} |",
        f"| Repetitions lost to invalid model output | {stats['repetitions_lost_to_model']} |",
        f"| Responses flagged for possible history content | {stats['history_flag_responses']} |",
        "",
        f"- API failure rate: {_ratio(stats['api_failure'])}",
        f"- Valid output, first pass: {_ratio(stats['valid_first_pass'])}",
        f"- Valid output, after retry: {_ratio(stats['valid_after_retry'])}",
        f"- Latency ms: {stats['latency_ms']}",
    ]

    analysis = metrics["failure_analysis"]
    lines += ["\n## Failure analysis\n", f"Counts: {analysis['counts']}\n", "| Image | Gold | Predicted | Reason |", "|---|---|---|---|"]
    lines += [f"| {i['image_id']} | {i['gold']} | {i['predicted']} | {i['reason']} |" for i in analysis["items"]]

    lines += [
        "\n## Estimates\n",
        f"- Attempts with reported usage: {_ratio(stats['attempts_with_usage'])}",
        f"- Estimated cost per image (USD): {stats['estimated_cost_per_image_usd']}. "
        "Calculated from reported tokens and configured list prices, for attempts with usage only. "
        "Not a billed amount.",
        "\n## Gate outcome\n",
        _gate_outcome(metrics, synthetic),
        "\n## Dataset limitations\n",
        LIMITATIONS,
    ]
    return "\n".join(lines) + "\n"


def _gate_outcome(metrics: dict, synthetic: bool) -> str:
    if synthetic:
        return "Not applicable. Synthetic fixtures cannot support a go or no-go decision."
    verdict = "All gates passed" if metrics["decision"]["all_passed"] else "At least one gate failed"
    return f"{verdict}. The go or no-go decision also needs the failure analysis, and it belongs to the reviewer."


def confusion_csv(confusion: dict) -> str:
    labels, columns, cells = confusion_rows(confusion)
    rows = [",".join(["gold", *columns])]
    rows += [",".join([label, *map(str, row)]) for label, row in zip(labels, cells)]
    return "\n".join(rows) + "\n"


def write_outputs(metrics: dict, run_id: str, run_dir: Path, synthetic: bool, context: dict | None = None) -> None:
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (run_dir / "report.md").write_text(render_report(metrics, run_id, synthetic, context), encoding="utf-8")
    (run_dir / "confusion_matrix.csv").write_text(confusion_csv(metrics["after_retry"]["confusion"]), encoding="utf-8")
    save_confusion_png(metrics["after_retry"]["confusion"], run_dir / "confusion_matrix.png", run_id)
