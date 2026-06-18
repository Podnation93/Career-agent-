"""Job search engine with pluggable source adapters."""

from .base import SearchAdapter, get_adapters

__all__ = ["SearchAdapter", "get_adapters"]
