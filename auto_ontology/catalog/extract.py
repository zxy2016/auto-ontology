# SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
# All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""Pull schema entities out of a SQLDatabase connector.

``extract_tabular_db_data`` takes a **connector** directly: it reads nothing
else, and taking a wrapper object would leave a library dependency in code that
is otherwise storage- and library-agnostic.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import pandas as pd

from auto_ontology.catalog import table_filter
from auto_ontology.catalog.normalize import normalize_columns, normalize_tables

if TYPE_CHECKING:  # pragma: no cover - typing only
    from auto_ontology.connectors.base import SQLDatabase

logger = logging.getLogger(__name__)


class IncompleteCatalogExtractionError(RuntimeError):
    """Raised when listed relations do not have a complete column inventory."""


def _relation_keys(frame: "pd.DataFrame | None") -> set[tuple[str, str]]:
    if frame is None or frame.empty:
        return set()
    keys = {_row_relation_key(row) for _, row in frame.iterrows()}
    return {key for key in keys if key[1]}


def _drop_undescribed_relations(
    tables: "pd.DataFrame | None", columns: "pd.DataFrame | None"
) -> set[tuple[str, str]]:
    """Return relations that were listed but have no columns, logging each skip.

    A relation with zero columns cannot be queried, and persisting it would make
    retrieval offer a table every generated query fails against. One such
    relation must not roll back the whole catalog, though: connectors encounter
    broken views (MySQL 1356 against a dropped base table) alongside healthy
    tables, and failing the entire database over one of them leaves the operator
    with nothing. Connectors are still expected to drop a relation they cannot
    describe from both frames (Kyuubi and Databricks do); this is the central
    backstop for the ones that cannot.
    """
    listed = _relation_keys(tables)
    if not listed:
        return set()
    described = _relation_keys(columns)
    missing = sorted(listed - described)
    if not missing:
        return set()
    preview = ", ".join(
        f"{schema + '.' if schema else ''}{table}" for schema, table in missing[:10]
    )
    suffix = "" if len(missing) <= 10 else f" (+{len(missing) - 10} more)"
    logger.warning(
        "Catalog extraction skipped %d relation(s) without columns: %s%s. "
        "The remaining relations were ingested; configure table_deny_regex "
        "to exclude these permanently.",
        len(missing),
        preview,
        suffix,
    )
    return set(missing)


def _row_relation_key(row: "pd.Series") -> tuple[str, str]:
    raw_schema = row.get("table_schema")
    raw_table = row.get("table_name")
    schema = "" if pd.isna(raw_schema) else str(raw_schema)
    table = "" if pd.isna(raw_table) else str(raw_table)
    return schema, table


def _drop_relations(
    frame: "pd.DataFrame | None", dropped: set[tuple[str, str]]
) -> "pd.DataFrame | None":
    if frame is None or frame.empty or not dropped:
        return frame
    if "table_schema" not in frame.columns or "table_name" not in frame.columns:
        return frame
    keep = [
        key not in dropped
        for key in (_row_relation_key(row) for _, row in frame.iterrows())
    ]
    return frame[keep]


def _drop_fk_rows(
    fks: "pd.DataFrame | None", dropped: set[tuple[str, str]]
) -> "pd.DataFrame | None":
    """Drop FKs whose owning or referenced relation was skipped."""
    if fks is None or fks.empty or not dropped:
        return fks
    keep = []
    for _, row in fks.iterrows():
        owner = _row_relation_key(row)
        raw_ref_schema = row.get("referenced_schema")
        raw_ref_table = row.get("referenced_table")
        referenced = (
            "" if pd.isna(raw_ref_schema) else str(raw_ref_schema),
            "" if pd.isna(raw_ref_table) else str(raw_ref_table),
        )
        keep.append(owner not in dropped and referenced not in dropped)
    return fks[keep]


def create_dataframe(connector: "SQLDatabase"):
    """Extract raw schema DataFrames from any SQLDatabase connector.

    The connector's optional ``table_filter`` (set from the connection's
    allow/deny regexes, see :mod:`auto_ontology.catalog.table_filter`) is applied
    here, before undescribed relations are dropped — this is the single point
    every connector's relations pass through, so both behaviours are identical
    for all of them.
    """
    tables = connector.get_tables()
    columns = connector.get_columns()
    views = connector.get_views()
    queries = connector.get_queries()
    pks = connector.get_pks()
    fks = connector.get_fks()
    tables, columns, views = table_filter.apply(
        tables,
        columns,
        views,
        getattr(connector, "table_filter", None) or table_filter.TableFilter(),
    )
    dropped = _drop_undescribed_relations(tables, columns)
    if dropped:
        tables = _drop_relations(tables, dropped)
        views = _drop_relations(views, dropped)
        pks = _drop_relations(pks, dropped)
        fks = _drop_fk_rows(fks, dropped)
    return tables, columns, views, queries, pks, fks


def data_for_populate_tabular(connector: "SQLDatabase") -> dict[str, Any]:
    """Build the ``data`` dict ``populate_tabular_data()`` expects."""
    tables, columns, views, queries, pks, fks = create_dataframe(connector)
    tables = normalize_tables(tables)
    columns = normalize_columns(columns)
    data = {
        "database_name": connector.database_name,
        "tables": tables,
        "columns": columns,
        "views": views,
        "pks": pks,
        "fks": fks,
        "queries": queries,
    }
    return data


def extract_tabular_db_data(connector: "SQLDatabase | None" = None) -> dict[str, Any]:
    """Step 1 — pull schema entities from the relational DB into a data dict.

    Returns a data dict with keys ``database_name``, ``tables``, ``columns``,
    ``views``, ``pks``, ``fks`` and ``queries``, or ``{}`` when *connector* is
    ``None``.
    """
    if connector is None:
        return {}
    return data_for_populate_tabular(connector)
