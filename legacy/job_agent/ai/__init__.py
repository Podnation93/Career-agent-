"""Pluggable AI provider layer.

The agent runs fully offline with the deterministic ``HeuristicProvider``. For
higher-quality writing you can switch to a local model (Ollama) or Anthropic
Claude via ``config.yaml``.
"""

from .provider import (
    AIProvider,
    AnthropicProvider,
    HeuristicProvider,
    OllamaProvider,
    get_provider,
)

__all__ = [
    "AIProvider",
    "HeuristicProvider",
    "OllamaProvider",
    "AnthropicProvider",
    "get_provider",
]
