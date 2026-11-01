"""Stage D command: one model at a time, generated images only. Nothing here can load a dataset image.

Run `catalog` first to read the real hosts and prices, then `preflight` with a host. Both refuse before any
network use unless the owner's approved commit is HEAD, the tree is clean, and the frozen files match.

    python -m live.stage_d catalog --model qwen3_vl_30b --approved-commit <full HEAD hash>
    python -m live.stage_d preflight --model qwen3_vl_30b --host <slug> --approved-commit <full HEAD hash>
"""
import argparse
import dataclasses
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from live.preflight import MAX_ATTEMPTS, REPETITIONS, RUN_TIMEOUT_S, run_preflight
from live.transport import HttpxTransport
from src.adapter import OpenAICompatibleAdapter, ProviderAdapter, ProviderConfig, load_api_key, require_credentials
from src.config import live_blockers, load_frozen_prompt, load_models, load_run_config
from src.guard import RunGuard, RunLimits, prior_usage

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results" / "preflight"
RUN_CONFIG = ROOT / "config" / "run.yaml"
MODELS_FILE = ROOT / "config" / "models.yaml"
# Estimated usage, per model and across all runs. 18 attempts at the ceiling cost $0.0378 and $0.0396.
MAX_USD_PER_MODEL = 0.05
CATALOG_TIMEOUT_S = 15.0
HOST_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*(/[a-z0-9-]+){0,2}$")
FROZEN_SHA256 = {
    "prompts/eval_v1.md": "67085eb828b94a407b0693c20ccdc5f47919fc7e5e817dae157a5d232c6db111",
    "dataset/manifest.csv": "ead8622726499c08d3cdbbfb75302f16caa374b0a99f6ff009948ea9be9a793d",
    "config/run.yaml": "9fc7125c7b891e0ce85159091eb75fdaeb0dcbb27d4f935f8f3545a23be4b2af",
    "config/models.yaml": "25222ee3a33f0405dc40852bb31eace0207d12e51225d9bfc23e4cdb7292fdc3",
}
GATEWAYS = {
    "qwen3_vl_30b": "https://openrouter.ai/api/v1",
    "gemma4_31b": "https://router.huggingface.co/v1",
}


class CatalogError(ValueError):
    pass


@dataclass(frozen=True)
class RepoState:
    head: str
    clean: bool


@dataclass(frozen=True)
class Listing:
    host: str
    input_usd_per_mtok: float
    output_usd_per_mtok: float
    structured_output: bool
    max_output_tokens: int | None = None
    quantization: str | None = None
    details: dict = field(default_factory=dict)


@dataclass
class Dependencies:
    repo: Callable[[], RepoState]
    get_json: Callable[[str, dict[str, str]], Any]
    make_adapter: Callable[[ProviderConfig, str], ProviderAdapter]
    env: dict[str, str]
    results: Path = RESULTS
    sleep: Callable[[float], None] = time.sleep
    out: Callable[[str], None] = print


def repo_state() -> RepoState:
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=10, check=True).stdout.strip()
    return RepoState(git("rev-parse", "HEAD"), not git("status", "--porcelain"))


def http_get_json(url: str, headers: dict[str, str]) -> Any:
    try:
        response = httpx.get(url, headers=headers, timeout=CATALOG_TIMEOUT_S, follow_redirects=False)
    except httpx.HTTPError as exc:
        raise CatalogError(f"catalog request failed: {type(exc).__name__}") from exc
    if response.status_code != 200:
        raise CatalogError(f"catalog returned HTTP {response.status_code}")
    try:
        return response.json()
    except ValueError as exc:
        raise CatalogError("catalog reply was not JSON") from exc


def frozen_problems(root: Path = ROOT) -> list[str]:
    return [f"{name} differs from its frozen hash" for name, expected in FROZEN_SHA256.items()
            if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected]


def _per_million(value: Any) -> float:
    try:
        return float(value) * 1e6
    except (TypeError, ValueError) as exc:
        raise CatalogError(f"unreadable price {value!r}") from exc


def parse_openrouter(payload: Any) -> list[Listing]:
    try:
        return [Listing(
            host=item.get("tag") or item["provider_name"], input_usd_per_mtok=_per_million(item["pricing"]["prompt"]),
            output_usd_per_mtok=_per_million(item["pricing"]["completion"]),
            structured_output="response_format" in item["supported_parameters"],
            max_output_tokens=item.get("max_completion_tokens"), quantization=item.get("quantization"),
            details={"structured_outputs": "structured_outputs" in item["supported_parameters"],
                     "seed": "seed" in item["supported_parameters"], "status": item.get("status"),
                     "uptime_last_1d": item.get("uptime_last_1d"), "context_length": item.get("context_length")},
        ) for item in payload["data"]["endpoints"]]
    except (KeyError, TypeError, AttributeError) as exc:
        raise CatalogError("unexpected OpenRouter catalog shape") from exc


def parse_huggingface(payload: Any, model: str) -> list[Listing]:
    repository = model.partition(":")[0]
    try:
        entry = next((item for item in payload["data"] if item["id"] == repository), None)
        if entry is None:
            raise CatalogError(f"{repository} is not in the Hugging Face catalog")
        return [Listing(
            host=item["provider"], input_usd_per_mtok=float(item["pricing"]["input"]),
            output_usd_per_mtok=float(item["pricing"]["output"]),
            structured_output=item.get("supports_structured_output") is True,
            details={"status": item.get("status"), "context_length": item.get("context_length")},
        ) for item in entry["providers"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise CatalogError("unexpected Hugging Face catalog shape") from exc


def read_catalog(config: ProviderConfig, deps: Dependencies) -> list[Listing]:
    if config.base_url == GATEWAYS["qwen3_vl_30b"]:
        url = f"{config.base_url}/models/{config.model}/endpoints"
        return parse_openrouter(deps.get_json(url, {"Authorization": f"Bearer {load_api_key(config, deps.env)}"}))
    return parse_huggingface(deps.get_json(f"{config.base_url}/models", {}), config.model)


def listing_problems(listing: Listing, config: ProviderConfig) -> list[str]:
    """A price above the configured one would make the spending guard understate cost, so it refuses."""
    problems = []
    if listing.input_usd_per_mtok > config.input_usd_per_mtok or listing.output_usd_per_mtok > config.output_usd_per_mtok:
        problems.append(f"{listing.host} costs more than config/models.yaml, so the guard would understate spending")
    if not listing.structured_output:
        problems.append(f"{listing.host} does not list structured output")
    if listing.max_output_tokens is not None and listing.max_output_tokens < config.max_output_tokens:
        problems.append(f"{listing.host} allows fewer output tokens than the run needs")
    return problems


def pin_host(config: ProviderConfig, host: str | None) -> ProviderConfig:
    """OpenRouter takes the host in the request. `config/models.yaml` stays at its frozen hash during Stage D."""
    if config.key != "qwen3_vl_30b" or not host:
        return config
    provider = {**config.extra_body["provider"], "order": [host]}
    return dataclasses.replace(config, extra_body={**config.extra_body, "provider": provider})


def gate_problems(args: argparse.Namespace, config: ProviderConfig | None, deps: Dependencies, root: Path = ROOT) -> list[str]:
    """Everything that must hold before any network use. Reports names only, never a key's value."""
    if config is None:
        return [f"{args.model} is not a Stage D model"]
    repo = deps.repo()
    problems = []
    if args.approved_commit != repo.head:
        problems.append("--approved-commit is not the current HEAD")
    if not repo.clean:
        problems.append("the working tree is not clean")
    problems += frozen_problems(root)
    if config.base_url != GATEWAYS[config.key]:
        problems.append(f"{config.key} points at an unexpected gateway")
    problems += [f"environment variable {name} is not set" for name in require_credentials([config], deps.env)]
    if args.command == "preflight":
        host = args.host
        if config.key == "qwen3_vl_30b" and not (host and HOST_SLUG.fullmatch(host)):
            problems.append("qwen3_vl_30b needs --host with a slug from the catalog step")
        if config.key != "qwen3_vl_30b" and host:
            problems.append(f"{config.key} is pinned by its model ID, so --host is not allowed")
        problems += [item for item in live_blockers({config.key: pin_host(config, host)})]
    return problems


def limits_for(run_config) -> RunLimits:
    return RunLimits(MAX_ATTEMPTS, RUN_TIMEOUT_S, run_config.limits.max_consecutive_provider_failures,
                     run_config.limits.assumed_input_tokens, MAX_USD_PER_MODEL)


def show(listing: Listing, deps: Dependencies) -> None:
    deps.out(json.dumps(dataclasses.asdict(listing)))


def next_run_id(model: str, results: Path) -> str:
    runs = results / model
    used = len(list(runs.iterdir())) if runs.exists() else 0
    return f"preflight-{model}-s{used + 1:02d}"


def execute(args: argparse.Namespace, deps: Dependencies, root: Path = ROOT) -> int:
    run_config = load_run_config(RUN_CONFIG)
    models = load_models(MODELS_FILE, run_config)
    config = models.get(args.model)
    problems = gate_problems(args, config, deps, root)
    if problems:
        deps.out("Refused. No network call was made:\n- " + "\n- ".join(problems))
        return 2
    try:
        listings = read_catalog(config, deps)
    except CatalogError as exc:
        deps.out(f"Refused. No paid call was made: {exc}")
        return 2
    if args.command == "catalog":
        for listing in listings:
            show(listing, deps)
        return 0

    wanted = args.host or config.model.partition(":")[2]
    matches = [listing for listing in listings if listing.host == wanted]
    problems = listing_problems(matches[0], config) if matches else [f"{wanted} is not listed for {config.model}"]
    limits = limits_for(run_config)
    attempts, spent = prior_usage(deps.results / config.key, limits, config)
    if attempts + 1 > limits.max_attempts:
        problems.append(f"{attempts} Stage D attempts already used, which is the limit")
    if problems:
        deps.out("Refused. No paid call was made:\n- " + "\n- ".join(problems))
        return 2

    pinned = pin_host(config, args.host)
    run_id = next_run_id(config.key, deps.results)
    run_dir = deps.results / config.key / run_id
    guard = RunGuard(limits, pinned, prior_attempts=attempts, prior_spend_usd=spent)
    prompt = load_frozen_prompt(ROOT, run_config)
    run_dir.mkdir(parents=True)
    (run_dir.parent / f"{run_id}.manifest.json").write_text(json.dumps({
        "commit": args.approved_commit, "model": pinned.model, "host": wanted, "repetitions": REPETITIONS,
        "max_usd": MAX_USD_PER_MODEL, "frozen_sha256": FROZEN_SHA256, "listing": dataclasses.asdict(matches[0]),
    }, indent=2), encoding="utf-8")
    result = run_preflight(deps.make_adapter(pinned, load_api_key(pinned, deps.env)), prompt, guard, run_id, run_dir, deps.sleep)
    result["estimated_spend_usd"] = guard.spent_usd
    (run_dir.parent / f"{run_id}.result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    deps.out(json.dumps(result, indent=2))
    deps.out(f"Stage D {'passed' if result['passed'] else 'FAILED'} for {config.key}. Estimated spending ${guard.spent_usd:.4f}.")
    return 0 if result["passed"] else 1


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Stage D checks, one model at a time, with generated images only")
    commands = root.add_subparsers(dest="command", required=True)
    for name, text in (("catalog", "list hosts and prices, with no inference"), ("preflight", "send the generated canaries")):
        command = commands.add_parser(name, help=text)
        command.add_argument("--model", required=True, choices=sorted(GATEWAYS))
        command.add_argument("--approved-commit", required=True, help="the full HEAD hash the owner approved")
        if name == "preflight":
            command.add_argument("--host", help="the catalog host for qwen3_vl_30b")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.command == "catalog":
        args.host = None
    def make_adapter(config: ProviderConfig, key: str) -> ProviderAdapter:
        return OpenAICompatibleAdapter(config, HttpxTransport(), key)

    return execute(args, Dependencies(repo_state, http_get_json, make_adapter, dict(os.environ)))


if __name__ == "__main__":
    sys.exit(main())
