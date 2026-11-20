# SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
# All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""Tests for term extraction sanitization."""

from __future__ import annotations

import pytest
from langchain_core.messages import BaseMessage
from pydantic import BaseModel

from auto_ontology.semantic.models import (
    ColumnAttributeSpec,
    RawTableTermsResult,
    RawTermProposal,
    TermColumnRef,
)
from auto_ontology.semantic import term_extractor
from auto_ontology.semantic.language import SemanticOutputLanguage
from auto_ontology.semantic.term_extractor import _sanitize_result


def test_sanitize_uses_llm_display_names() -> None:
    specs = [
        ColumnAttributeSpec(
            source_column="amount",
            name="amount",
            datatype="numeric",
        ),
        ColumnAttributeSpec(
            source_column="status",
            name="status",
            datatype="text",
        ),
    ]
    raw = RawTableTermsResult(
        terms=[
            RawTermProposal(
                name="PurchaseOrder",
                description="A purchase order",
                attributes=[
                    TermColumnRef(
                        source_column="amount",
                        display_name="TotalAmount",
                    )
                ],
            )
        ]
    )

    result = _sanitize_result(raw, table={"name": "purchase_orders"}, specs=specs)

    assert len(result.terms) == 1
    assert result.terms[0].name == "Purchase Order"
    assigned = {a.source_column: a.display_name for a in result.terms[0].attributes}
    assert assigned == {"amount": "Total Amount", "status": "status"}
    assert specs[0].display_name == "Total Amount"
    assert specs[1].display_name == "status"


def test_sanitize_assigns_orphan_specs_to_primary_term() -> None:
    specs = [
        ColumnAttributeSpec(
            source_column="amount",
            name="amount",
            datatype="numeric",
        ),
        ColumnAttributeSpec(
            source_column="status",
            name="status",
            datatype="text",
        ),
    ]
    raw = RawTableTermsResult(
        terms=[
            RawTermProposal(
                name="Purchase Order",
                description="A purchase order",
                attributes=[
                    TermColumnRef(
                        source_column="amount",
                        display_name="Total Amount",
                    ),
                    TermColumnRef(
                        source_column="status",
                        display_name="Order Status",
                    ),
                ],
            )
        ]
    )

    result = _sanitize_result(raw, table={"name": "purchase_orders"}, specs=specs)

    assigned = {a.source_column: a.display_name for a in result.terms[0].attributes}
    assert assigned == {
        "amount": "Total Amount",
        "status": "Order Status",
    }
    assert specs[0].display_name == "Total Amount"
    assert specs[1].display_name == "Order Status"


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("Customer Order", "Customer Order"),
        ("Numéro Client", "Numéro Client"),
        ("受注", "受注"),
        ("주문 내역", "주문 내역"),
        # Still rejected, as before: lowercase start, double space, leading digit.
        ("purchase order", "Fallback"),
        ("Order  Date", "Fallback"),
        ("2nd Order", "Fallback"),
        ("unknown", "Fallback"),
    ],
)
def test_llm_labels_are_accepted_in_any_script(label: str, expected: str) -> None:
    assert term_extractor._normalize_label(label, fallback="Fallback") == expected


@pytest.mark.parametrize(
    ("language", "instruction", "term_name", "last_label"),
    [
        ("zh-CN", "Simplified Chinese", "销项发票", "价税合计"),
        ("en", "English", "Sales Invoice", "Total With Tax"),
    ],
)
def test_selected_language_reaches_term_and_wide_table_labels(
    monkeypatch: pytest.MonkeyPatch,
    language: SemanticOutputLanguage,
    instruction: str,
    term_name: str,
    last_label: str,
) -> None:
    specs = [
        ColumnAttributeSpec(
            source_column=f"field_{i}", name=f"Field {i}", datatype="text"
        )
        for i in range(40)
    ] + [ColumnAttributeSpec(source_column="total", name="Total", datatype="numeric")]
    calls = []

    def invoke(
        _client: object, messages: list[BaseMessage], response_model: type[BaseModel]
    ) -> BaseModel:
        assert instruction in messages[0].content
        calls.append(messages[1].content)
        if response_model is RawTableTermsResult:
            return RawTableTermsResult(
                terms=[
                    RawTermProposal(
                        name=term_name,
                        attributes=[
                            TermColumnRef(
                                source_column=spec.source_column,
                                display_name=last_label,
                            )
                            for spec in specs[:-1]
                        ],
                    )
                ]
            )
        return response_model.model_validate(
            {"attributes": [{"source_column": "total", "display_name": last_label}]}
        )

    monkeypatch.setattr(term_extractor, "get_llm_client", lambda **kwargs: None)
    monkeypatch.setattr(term_extractor, "invoke_with_structured_output", invoke)
    result = term_extractor.extract_term(
        {"name": "sales_invoices"}, {}, specs, output_language=language
    )
    assert len(calls) == 2 and "source_column=total" in calls[1]
    assert len(result.terms) == 1 and result.terms[0].name == term_name
    assert len(result.terms[0].attributes) == 41
    assert result.terms[0].attributes[-1].source_column == "total"
    assert result.terms[0].attributes[-1].display_name == last_label
    assert specs[-1].display_name == last_label
