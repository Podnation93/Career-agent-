"""Configuration loading for the agent.

Reads ``config.yaml`` from the project root (or a path given via the
``JOB_AGENT_CONFIG`` environment variable) and exposes a small typed wrapper.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"


class Config:
    """Thin convenience wrapper around the parsed YAML config."""

    def __init__(self, data: dict[str, Any], path: Path):
        self._data = data
        self.path = path

    # Generic accessor with dotted keys, e.g. cfg.get("ai.provider").
    def get(self, dotted_key: str, default: Any = None) -> Any:
        node: Any = self._data
        for part in dotted_key.split("."):
            if not isinstance(node, dict) or part not in node:
                return default
            node = node[part]
        return node

    @property
    def root(self) -> Path:
        return self.path.parent

    def resolve(self, dotted_key: str, default: str) -> Path:
        """Resolve a config path relative to the project root."""
        value = self.get(dotted_key, default)
        p = Path(value)
        return p if p.is_absolute() else (self.root / p)

    @property
    def database_path(self) -> Path:
        return self.resolve("database", "job_agent/data/agent.db")

    @property
    def output_dir(self) -> Path:
        return self.resolve("output_dir", "job_agent/data/applications")

    @property
    def target_roles(self) -> list[str]:
        return self.get("target_roles", []) or []

    @property
    def min_match_score(self) -> int:
        return int(self.get("min_match_score", 60))

    @property
    def search_sources(self) -> list[str]:
        return self.get("search.sources", ["sample"]) or ["sample"]


def load_config(path: str | os.PathLike | None = None) -> Config:
    cfg_path = Path(path) if path else Path(os.environ.get("JOB_AGENT_CONFIG", DEFAULT_CONFIG_PATH))
    if not cfg_path.exists():
        raise FileNotFoundError(
            f"Config file not found at {cfg_path}. Copy config.yaml to that location."
        )
    with cfg_path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    return Config(data, cfg_path)
