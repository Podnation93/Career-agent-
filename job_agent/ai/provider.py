"""AI provider abstraction.

A provider turns a prompt into text. Three implementations ship:

* ``HeuristicProvider`` — no dependencies, returns ``None`` from ``generate`` so
  callers fall back to their deterministic templates. This keeps the agent fully
  functional with zero setup.
* ``OllamaProvider`` — calls a local Ollama server (privacy-friendly).
* ``AnthropicProvider`` — calls the Claude API.

Document-generation callers always have a deterministic fallback, so a provider
returning ``None`` (or failing) never breaks the pipeline.
"""

from __future__ import annotations

import os
from typing import Protocol

from ..config import Config


class AIProvider(Protocol):
    name: str

    def generate(self, prompt: str, *, system: str = "", max_tokens: int = 1024) -> str | None:
        """Return generated text, or ``None`` if generation is unavailable."""
        ...


class HeuristicProvider:
    """No-LLM provider. Always returns ``None`` so callers use templates."""

    name = "heuristic"

    def generate(self, prompt: str, *, system: str = "", max_tokens: int = 1024) -> str | None:
        return None


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(self, prompt: str, *, system: str = "", max_tokens: int = 1024) -> str | None:
        try:
            import httpx
        except ImportError:
            return None
        try:
            resp = httpx.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "system": system,
                    "stream": False,
                    "options": {"num_predict": max_tokens},
                },
                timeout=120,
            )
            resp.raise_for_status()
            return (resp.json().get("response") or "").strip() or None
        except Exception:
            return None


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, model: str, max_tokens: int):
        self.model = model
        self.default_max_tokens = max_tokens
        self.api_key = os.environ.get("ANTHROPIC_API_KEY", "")

    def generate(self, prompt: str, *, system: str = "", max_tokens: int = 1024) -> str | None:
        if not self.api_key:
            return None
        try:
            import httpx
        except ImportError:
            return None
        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": max_tokens or self.default_max_tokens,
                    "system": system,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=120,
            )
            resp.raise_for_status()
            blocks = resp.json().get("content", [])
            text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
            return text.strip() or None
        except Exception:
            return None


def get_provider(cfg: Config) -> AIProvider:
    provider = (cfg.get("ai.provider", "heuristic") or "heuristic").lower()
    if provider == "ollama":
        return OllamaProvider(
            base_url=cfg.get("ai.ollama.base_url", "http://localhost:11434"),
            model=cfg.get("ai.ollama.model", "llama3.1"),
        )
    if provider == "anthropic":
        return AnthropicProvider(
            model=cfg.get("ai.anthropic.model", "claude-sonnet-4-6"),
            max_tokens=int(cfg.get("ai.anthropic.max_tokens", 2000)),
        )
    return HeuristicProvider()
