from copy import deepcopy
from pathlib import Path

import pytest
import yaml

from src.config import ConfigError, files_sha256, load_frozen_prompt, load_models, load_run_config

ROOT = Path(__file__).resolve().parents[1]
RUN = ROOT / "config" / "run.yaml"
MODELS = ROOT / "config" / "models.yaml"


def write(tmp_path, data, name="run.yaml"):
    path = tmp_path / name
    path.write_text(yaml.safe_dump(data))
    return path


@pytest.fixture
def run_data():
    return yaml.safe_load(RUN.read_text())


def test_real_config_loads():
    config = load_run_config(RUN)
    assert (config.repetitions, config.retries.provider, config.retries.repair) == (3, 1, 1)


def test_real_models_load_and_take_settings_from_the_run():
    config = load_run_config(RUN)
    models = load_models(MODELS, config)
    assert set(models) == {"qwen3_vl_30b", "gemma4_31b"}
    assert models["qwen3_vl_30b"].seed == config.seed
    assert models["gemma4_31b"].temperature == config.temperature


def test_missing_file_is_a_config_error(tmp_path):
    with pytest.raises(ConfigError, match="not found"):
        load_run_config(tmp_path / "none.yaml")


def test_invalid_yaml_is_a_config_error(tmp_path):
    path = tmp_path / "bad.yaml"
    path.write_text("a: [unclosed")
    with pytest.raises(ConfigError, match="not valid YAML"):
        load_run_config(path)


def test_non_mapping_is_a_config_error(tmp_path):
    path = tmp_path / "list.yaml"
    path.write_text("- a\n- b\n")
    with pytest.raises(ConfigError, match="mapping"):
        load_run_config(path)


@pytest.mark.parametrize("mutate", [
    lambda d: d.update(unknown=1),
    lambda d: d.update(repetitions=0),
    lambda d: d.pop("seed"),
    lambda d: d["prompt"].update(sha256="short"),
    lambda d: d["preprocess"].update(jpeg_quality=500),
    lambda d: d["retries"].update(provider=-1),
])
def test_invalid_fields_are_rejected(tmp_path, run_data, mutate):
    data = deepcopy(run_data)
    mutate(data)
    with pytest.raises(ConfigError):
        load_run_config(write(tmp_path, data))


@pytest.mark.parametrize("gate,value", [
    ("top1", {"numerator": 2, "denominator": 5}),
    ("top3", {"numerator": 3, "denominator": 5}),
    ("rejection", {"numerator": 1, "denominator": 2}),
    ("valid_after_retry", 0.5),
    ("reproducibility", 0.5),
])
def test_changing_an_approved_gate_is_refused(tmp_path, run_data, gate, value):
    data = deepcopy(run_data)
    data["gates"][gate] = value
    with pytest.raises(ConfigError, match="differ from the approved gates"):
        load_run_config(write(tmp_path, data))


def test_equivalent_gate_fraction_is_accepted(tmp_path, run_data):
    data = deepcopy(run_data)
    data["gates"]["top1"] = {"numerator": 15, "denominator": 30}
    assert load_run_config(write(tmp_path, data)).gates.top1.value == 0.5


def test_frozen_prompt_loads():
    config = load_run_config(RUN)
    assert load_frozen_prompt(ROOT, config).sha256 == config.prompt.sha256


def test_changed_prompt_is_refused(tmp_path, run_data):
    data = deepcopy(run_data)
    data["prompt"]["sha256"] = "0" * 64
    config = load_run_config(write(tmp_path, data))
    with pytest.raises(ConfigError, match="prompt hash mismatch"):
        load_frozen_prompt(ROOT, config)


def test_missing_prompt_is_refused(tmp_path):
    with pytest.raises(ConfigError, match="prompt not found"):
        load_frozen_prompt(tmp_path, load_run_config(RUN))


def test_invalid_model_entry_is_rejected(tmp_path):
    config = load_run_config(RUN)
    data = {"models": {"m": {"base_url": "u", "model": "x", "api_key_env": "K", "response_format": "text"}}}
    with pytest.raises(ConfigError):
        load_models(write(tmp_path, data, "models.yaml"), config)


def test_empty_models_are_rejected(tmp_path):
    with pytest.raises(ConfigError):
        load_models(write(tmp_path, {"models": {}}, "models.yaml"), load_run_config(RUN))


def test_config_hash_changes_with_content(tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    a.write_text("one")
    b.write_text("two")
    assert files_sha256(a) != files_sha256(b)
