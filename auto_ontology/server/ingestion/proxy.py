# SPDX-FileCopyrightText: Copyright (c) 2024-2026, NVIDIA CORPORATION & AFFILIATES.
# All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""HTTP client for the ingestion service API.

Lightweight on purpose: it only depends on ``httpx`` so the server can trigger
ingest over HTTP without importing ``auto_ontology.ingestion_service.ingest``
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from auto_ontology.semantic.language import SemanticOutputLanguage

logger = logging.getLogger(__name__)

DEFAULT_INGESTION_SERVICE_URL = "http://localhost:3002"

# The service endpoints return 202 immediately, so a short timeout is enough.
_REQUEST_TIMEOUT = 10.0


def _base_url() -> str:
    """Base URL of the ingestion service, configurable for local vs Docker."""
    url = os.environ.get("INGESTION_SERVICE_URL", DEFAULT_INGESTION_SERVICE_URL)
    return url.rstrip("/")


def trigger_ingest(connection: dict[str, Any]) -> None:
    """Ask the ingestion service to ingest a connection (best-effort)."""
    url = f"{_base_url()}/ingest"
    try:
        httpx.post(url, json=connection, timeout=_REQUEST_TIMEOUT).raise_for_status()
    except Exception:
        logger.exception("Failed to trigger ingest via %s", url)


def trigger_semantic_compile() -> None:
    """Ask the ingestion service to run semantic compilation (best-effort).

    The service starts its semantic scheduler if it isn't running yet, so this
    also takes effect when compilation is enabled while the service is up.
    """
    url = f"{_base_url()}/semantic/compile"
    try:
        httpx.post(url, timeout=_REQUEST_TIMEOUT).raise_for_status()
    except Exception:
        logger.exception("Failed to trigger semantic compile via %s", url)


def get_live_semantic_compilation_status() -> tuple[
    bool, SemanticOutputLanguage | None
]:
    """Read the scheduler's in-memory run state without depending on it for history."""
    url = f"{_base_url()}/semantic/status"
    try:
        response = httpx.get(url, timeout=_REQUEST_TIMEOUT)
        response.raise_for_status()
        data = response.json()
        running = bool(data.get("running", False))
        language = data.get("active_output_language") if running else None
        return running, language if language in ("en", "zh-CN") else None
    except Exception as exc:
        logger.warning(
            "Failed to query semantic compilation status via %s: %s", url, exc
        )
        return False, None


def trigger_semantic_reset(database_name: str | None = None) -> None:
    """Ask the ingestion service to delete the semantic layer (best-effort).

    Omitting ``database_name`` resets every database. The service deletes the
    semantic nodes and embeddings without recompiling; the next scheduled run
    rebuilds them.
    """
    url = f"{_base_url()}/semantic/reset"
    params = {} if database_name is None else {"database_name": database_name}
    try:
        httpx.post(
            url,
            params=params,
            timeout=_REQUEST_TIMEOUT,
        ).raise_for_status()
    except Exception:
        logger.exception("Failed to trigger semantic reset via %s", url)


def trigger_reset(database_name: str) -> None:
    """Ask the ingestion service to reset a database's data (best-effort)."""
    url = f"{_base_url()}/ingest/delete"
    try:
        httpx.post(
            url,
            params={"database_name": database_name},
            timeout=_REQUEST_TIMEOUT,
        ).raise_for_status()
    except Exception:
        logger.exception("Failed to trigger reset via %s", url)
