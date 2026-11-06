# SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
# All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""Catalog extraction coverage tests."""

from __future__ import annotations

import logging
from types import SimpleNamespace

import pandas as pd

from auto_ontology.catalog.extract import (
    _relation_keys,
    create_dataframe,
)


def _connector(
    tables: list[dict],
    columns: list[dict],
    *,
    views: list[dict] | None = None,
    pks: list[dict] | None = None,
    fks: list[dict] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        get_tables=lambda: pd.DataFrame(tables),
        get_columns=lambda: pd.DataFrame(columns),
        get_views=lambda: pd.DataFrame(views or []),
        get_queries=lambda: pd.DataFrame(),
        get_pks=lambda: pd.DataFrame(pks or []),
        get_fks=lambda: pd.DataFrame(fks or []),
    )


def test_empty_catalog_is_valid() -> None:
    tables, columns, *_rest = create_dataframe(_connector([], []))

    assert tables.empty
    assert columns.empty


def test_nullable_relation_identifiers_are_normalized_without_boolean_coercion() -> (
    None
):
    frame = pd.DataFrame(
        [
            {"table_schema": pd.NA, "table_name": "orders"},
            {"table_schema": "sales", "table_name": pd.NA},
        ]
    )

    assert _relation_keys(frame) == {("", "orders")}


def test_every_listed_relation_with_columns_is_valid() -> None:
    connector = _connector(
        [
            {"table_schema": "sales", "table_name": "orders"},
            {"table_schema": "sales", "table_name": "customers"},
        ],
        [
            {
                "table_schema": "sales",
                "table_name": "orders",
                "column_name": "id",
            },
            {
                "table_schema": "sales",
                "table_name": "customers",
                "column_name": "id",
            },
        ],
    )

    tables, columns, *_rest = create_dataframe(connector)

    assert len(tables) == 2
    assert len(columns) == 2


def test_listed_relation_without_columns_is_skipped_with_warning(
    caplog: logging.LogRecord,
) -> None:
    connector = _connector(
        [
            {"table_schema": "sales", "table_name": "orders"},
            {"table_schema": "private", "table_name": "customers"},
        ],
        [
            {
                "table_schema": "sales",
                "table_name": "orders",
                "column_name": "id",
            }
        ],
    )

    with caplog.at_level(logging.WARNING):
        tables, columns, *_rest = create_dataframe(connector)

    assert list(tables["table_name"]) == ["orders"]
    assert list(columns["table_name"]) == ["orders"]
    assert "1 relation" in caplog.text
    assert "private.customers" in caplog.text


def test_skipped_relation_drops_its_views_pks_and_fks() -> None:
    connector = _connector(
        [
            {"table_schema": "s", "table_name": "broken"},
            {"table_schema": "s", "table_name": "ok"},
        ],
        [{"table_schema": "s", "table_name": "ok", "column_name": "id"}],
        views=[
            {
                "table_schema": "s",
                "table_name": "broken",
                "view_definition": "select 1",
            }
        ],
        pks=[{"table_schema": "s", "table_name": "broken", "column_name": "id"}],
        fks=[
            {
                "table_schema": "s",
                "table_name": "broken",
                "column_name": "ok_id",
                "referenced_schema": "s",
                "referenced_table": "ok",
            },
            {
                "table_schema": "s",
                "table_name": "ok",
                "column_name": "broken_id",
                "referenced_schema": "s",
                "referenced_table": "broken",
            },
        ],
    )

    tables, _columns, views, _queries, pks, fks = create_dataframe(connector)

    assert list(tables["table_name"]) == ["ok"]
    assert views.empty
    assert pks.empty
    assert fks.empty
