"""Render metrics into a Markdown report and a confusion matrix image."""
import json
from pathlib import Path

from .metrics import PREDICTED_COLUMNS

LIMITATIONS = (
    "These are preliminary engineering gates on a small development dataset, not evidence of general accuracy.\n\n"
    "- Images are a convenience sample, so results do not represent historical writing systems worldwide.\n"
    "- Per-script figures rest on about five images each and are descriptive only.\n"
    "- Single-source classes, printed plates, and famous objects may let a model use cues other than the script.\n"
    "- Prompts tuned on this set make it unusable as independent evaluation.\n"
    "- No 88% accuracy claim can be made from this experiment.\n"
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


def render_report(metrics: dict, run_id: str, synthetic: bool) -> str:
    first, after, stats = metrics["first_attempt"], metrics["after_retry"], metrics["attempts"]
    lines = [f"# Results: {run_id}\n", SYNTHETIC_BANNER if synthetic else ""]
    lines += ["## Measured results\n", "| Metric | First attempt | After retries |", "|---|---|---|"]
    for key, name in [("top1", "Top-1 accuracy"), ("top3", "Top-3 recall"), ("coverage", "Coverage"),
                      ("rejection", "Rejection"), ("strict_rejection", "Strict rejection"),
                      ("reproducibility", "Reproducibility")]:
        lines.append(f"| {name} | {_ratio(first[key])} | {_ratio(after[key])} |")

    lines += ["\n## Gates (after retries)\n", "| Gate | Result | Required | Threshold | Passed |", "|---|---|---|---|---|"]
    for name, gate in metrics["decision"]["gates"].items():
        lines.append(f"| {name} | {_ratio(gate)} | {gate['required']}/{gate['n']} | {gate['threshold']:.0%} "
                     f"| {'yes' if gate['passed'] else 'NO'} |")

    lines += ["\n## Per script (after retries)\n", "| Script | Precision | Recall |", "|---|---|---|"]
    for script, block in after["per_script"].items():
        lines.append(f"| {script} | {_ratio(block['precision'])} | {_ratio(block['recall'])} |")

    lines += ["\n## Confusion matrix (after retries)\n", confusion_markdown(after["confusion"])]
    lines += [
        "\n## Reliability\n",
        f"- API failure rate: {_ratio(stats['api_failure'])}; kinds: {stats['api_failure_kinds']}",
        f"- Valid output, first pass: {_ratio(stats['valid_first_pass'])}",
        f"- Valid output, after retry: {_ratio(stats['valid_after_retry'])}",
        f"- Repetitions lost to provider failures: {stats['repetitions_lost_to_provider']}",
        f"- Repetitions lost to invalid model output: {stats['repetitions_lost_to_model']}",
        f"- Retries: {stats['retries']}",
        f"- Responses flagged for possible history content: {stats['history_flag_responses']}",
        f"- Latency ms: {stats['latency_ms']}",
        "\n## Estimates\n",
        f"- Estimated cost per image (USD): {stats['estimated_cost_per_image_usd']}. "
        "Calculated from reported tokens and configured list prices. Not a billed amount.",
        "\n## Dataset limitations\n",
        LIMITATIONS,
    ]
    return "\n".join(lines) + "\n"


def write_outputs(metrics: dict, run_id: str, run_dir: Path, synthetic: bool) -> None:
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    (run_dir / "report.md").write_text(render_report(metrics, run_id, synthetic), encoding="utf-8")
    save_confusion_png(metrics["after_retry"]["confusion"], run_dir / "confusion_matrix.png", run_id)
