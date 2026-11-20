# SPDX-FileCopyrightText: Copyright (c) 2026, NVIDIA CORPORATION & AFFILIATES.
# All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""LLM Term extraction — names and column display-name assignments only."""

from __future__ import annotations

import logging
import unicodedata
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from auto_ontology.semantic.cancellation import is_cancelled
from auto_ontology.semantic.deterministic import _is_word_char, to_term_name
from auto_ontology.semantic.domain import DomainSummary
from auto_ontology.semantic.language import (
    DEFAULT_SEMANTIC_OUTPUT_LANGUAGE,
    SemanticOutputLanguage,
    semantic_text_prompt,
)
from auto_ontology.utils.llm_invoke import (
    get_llm_client,
    invoke_with_structured_output,
)
from pydantic import BaseModel, ConfigDict, Field

from auto_ontology.semantic.models import (
    ColumnAttributeSpec,
    RawTableTermsResult,
    TableTermsResult,
    TermAttributeAssignment,
    TermColumnRef,
    TermProposal,
)

logger = logging.getLogger(__name__)
_INVALID = {"unnamed", "unknown", "none", ""}
_TERM_COLUMN_LIMIT = 40
_LABEL_BATCH_SIZE = 20


def _is_display_label(label: str) -> bool:
    """Words of letters, digits and marks in any script, single-spaced, each
    starting with a letter, and the first not lowercase.

    For ASCII this is the old ``^[A-Z][A-Za-z0-9]*( [A-Za-z][A-Za-z0-9]*)*$``.
    It also accepts ``Numéro Client`` and ``受注``, which that pattern threw
    away. Scripts without letter case pass the capitalisation rule because
    their letters are never lowercase.
    """
    words = label.split(" ")
    return (
        all(word and word[0].isalpha() for word in words)
        and all(_is_word_char(char) for word in words for char in word)
        and not words[0][0].islower()
    )


_SYSTEM = """\
You propose business Terms for a relational table and assign candidate columns \
to each Term with user-friendly display labels.

Rules:
1. Strongly prefer ONE Term per table. A second Term is warranted ONLY when the \
table is a true junction between two unrelated entities. Never split a single \
entity into separate Terms for its core fields versus its metadata, lifecycle, \
or audit fields — those all belong to the same Term. If in doubt, use one Term.
2. Use a natural business name and a short business definition for each Term.
3. Assign EVERY candidate column to exactly one Term. For each assignment return \
source_column exactly as given and a display_name — a user-friendly ColumnAttribute label.
4. Do not propose IS_A, PART_OF, or ROLE relationships.
5. If the table name contains a word that indicates it is a variant of another table \
(e.g. ARC, ARCHIVE, HIST, HISTORY, STAGING, DELETED, TEMP), qualify every display_name \
to distinguish that variant using natural phrasing in the output language."""

_LABEL_SYSTEM = """\
Name the attributes for an existing business term over a relational table. \
For each candidate return the exact source_column and a natural, concise display_name. \
Use the table and column evidence. Qualify names for historical, archived, staging, \
deleted or temporary tables. Preserve the meaning of each field."""


class _ColumnLabels(BaseModel):
    attributes: list[TermColumnRef]


class _SynonymExtractionModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    synonyms: list[str] = Field(
        default_factory=list,
        description=(
            "Abbreviations, acronyms, or alternate names explicitly written in the "
            "description. Empty list if none are stated."
        ),
    )


_SYNONYM_SYSTEM = """\
Your only task is to extract alternate names for a business entity from a table description.

Look for abbreviations, acronyms, or aliases that are explicitly written — for example \
through phrases like "also referred to as", "also known as", "abbreviated as", \
"short for", "stands for", or a parenthetical directly after the entity name such as \
"business unit (BU)".

Return each alternate name verbatim as a separate entry in synonyms.
Example: "business unit (BU)" → synonyms: ["BU"]

Return an empty list if no alternate names are explicitly stated. \
Do NOT infer, guess, or add any name that is not directly written in the description."""


def _normalize_label(name: str, *, fallback: str) -> str:
    cleaned = unicodedata.normalize("NFC", name.strip())
    if cleaned.lower() in _INVALID or not _is_display_label(cleaned):
        return fallback
    return to_term_name(cleaned)


def _format_spec_line(spec: ColumnAttributeSpec) -> str:
    desc = f" — {spec.column_description}" if spec.column_description else ""
    return f"  - source_column={spec.source_column} ({spec.datatype}){desc}"


def apply_display_names_to_specs(
    table_result: TableTermsResult,
    specs: list[ColumnAttributeSpec],
) -> None:
    """Write LLM display labels back onto column specs for downstream merges."""
    by_column = {spec.source_column: spec for spec in specs}
    for term in table_result.terms:
        for attr in term.attributes:
            spec = by_column.get(attr.source_column)
            if spec is not None:
                spec.display_name = attr.display_name
    for spec in specs:
        if not spec.display_name:
            spec.display_name = spec.name


def _fallback_result(
    table: dict[str, Any],
    specs: list[ColumnAttributeSpec],
    output_language: SemanticOutputLanguage = DEFAULT_SEMANTIC_OUTPUT_LANGUAGE,
) -> TableTermsResult:
    name = to_term_name(table["name"])
    description = (
        f"由数据表 {table['name']} 表示的业务实体"
        if output_language == "zh-CN"
        else f"Business entity represented by table {table['name']}"
    )
    attributes = [
        TermAttributeAssignment(
            source_column=spec.source_column,
            display_name=spec.name,
        )
        for spec in specs
    ]
    result = TableTermsResult(
        terms=[
            TermProposal(
                name=name,
                description=description,
                attributes=attributes,
            )
        ]
    )
    apply_display_names_to_specs(result, specs)
    return result


def _sanitize_result(
    result: RawTableTermsResult,
    *,
    table: dict[str, Any],
    specs: list[ColumnAttributeSpec],
    output_language: SemanticOutputLanguage = DEFAULT_SEMANTIC_OUTPUT_LANGUAGE,
) -> TableTermsResult:
    spec_by_column = {spec.source_column: spec for spec in specs}
    allowed_columns = set(spec_by_column)
    default_term = to_term_name(table["name"])

    sanitized_terms: list[TermProposal] = []
    seen_term_names: set[str] = set()
    assigned_columns: set[str] = set()

    for raw_term in result.terms:
        term_name = _normalize_label(raw_term.name, fallback=default_term)
        if term_name in seen_term_names:
            continue
        seen_term_names.add(term_name)

        attributes: list[TermAttributeAssignment] = []
        for raw_attr in raw_term.attributes:
            source_column = raw_attr.source_column.strip()
            if (
                not source_column
                or source_column not in allowed_columns
                or source_column in assigned_columns
            ):
                continue
            spec = spec_by_column[source_column]
            attributes.append(
                TermAttributeAssignment(
                    source_column=source_column,
                    display_name=_normalize_label(
                        raw_attr.display_name,
                        fallback=spec.name,
                    ),
                )
            )
            assigned_columns.add(source_column)

        sanitized_terms.append(
            TermProposal(
                name=term_name,
                description=raw_term.description.strip(),
                attributes=attributes,
            )
        )

    if not sanitized_terms:
        return _fallback_result(table, specs, output_language)

    # Any unassigned columns fall back to the first Term.
    primary = sanitized_terms[0]
    for spec in specs:
        if spec.source_column not in assigned_columns:
            primary.attributes.append(
                TermAttributeAssignment(
                    source_column=spec.source_column,
                    display_name=spec.name,
                )
            )
            assigned_columns.add(spec.source_column)

    table_result = TableTermsResult(terms=sanitized_terms)
    apply_display_names_to_specs(table_result, specs)
    return table_result


def _extract_synonyms(description: str) -> list[str]:
    """Dedicated LLM call to extract alternate names from a table description."""
    if not description:
        return []
    result = invoke_with_structured_output(
        get_llm_client(temperature=0.0, max_tokens=1024),
        [
            SystemMessage(content=_SYNONYM_SYSTEM),
            HumanMessage(content=f"Description: {description}"),
        ],
        _SynonymExtractionModel,
    )
    if result is None:
        return []
    return [s.strip() for s in result.synonyms if s.strip()]


def generate_column_labels(
    table: dict[str, Any],
    term_name: str,
    specs: list[ColumnAttributeSpec],
    output_language: SemanticOutputLanguage,
) -> dict[str, str]:
    """Name columns separately from assigning them to a Term."""
    labels: dict[str, str] = {}
    for start in range(0, len(specs), _LABEL_BATCH_SIZE):
        if is_cancelled():
            break
        batch = specs[start : start + _LABEL_BATCH_SIZE]
        source_columns = {spec.source_column for spec in batch}
        lines = "\n".join(_format_spec_line(spec) for spec in batch)
        try:
            result = invoke_with_structured_output(
                get_llm_client(temperature=0.0, max_tokens=4096),
                [
                    SystemMessage(
                        content=semantic_text_prompt(_LABEL_SYSTEM, output_language)
                    ),
                    HumanMessage(
                        content=f"Table: {table['name']}\n"
                        f"Description: {table.get('description') or ''}\n"
                        f"Term: {term_name}\nColumns:\n{lines}"
                    ),
                ],
                _ColumnLabels,
            )
        except Exception:
            logger.warning(
                "[%s] Could not generate column labels", table["name"], exc_info=True
            )
            continue
        if result is None:
            continue
        for attr in result.attributes:
            if attr.source_column in source_columns:
                if label := _normalize_label(attr.display_name, fallback=""):
                    labels.setdefault(attr.source_column, label)
    if len(labels) < len(specs):
        logger.warning(
            "[%s] Using source-derived labels for %d column(s) without generated labels",
            table["name"],
            len(specs) - len(labels),
        )
    return labels


def extract_term(
    table: dict[str, Any],
    ctx: dict[str, Any],
    specs: list[ColumnAttributeSpec],
    *,
    domain_summary: DomainSummary | None = None,
    output_language: SemanticOutputLanguage = DEFAULT_SEMANTIC_OUTPUT_LANGUAGE,
) -> TableTermsResult:
    """Propose one or more Terms and assign candidate column attributes to each."""
    if not specs:
        return _fallback_result(table, specs, output_language)

    description = table.get("description") or ""

    spec_lines = "\n".join(
        _format_spec_line(spec) for spec in specs[:_TERM_COLUMN_LIMIT]
    )
    domain_block = ""
    if domain_summary:
        domain_block = (
            f"\nDomains: {', '.join(domain_summary.domains[:8])}\n"
            f"Core entities: {', '.join(domain_summary.core_entities[:12])}\n"
        )
    prompt = (
        f"Table: {table['name']}\n"
        f"Description: {description}\n"
        f"Candidate columns (assign each to exactly one Term with a display_name):\n"
        f"{spec_lines}\n"
        f"{domain_block}"
    )
    result = invoke_with_structured_output(
        get_llm_client(temperature=0.0, max_tokens=4096),
        [
            SystemMessage(content=semantic_text_prompt(_SYSTEM, output_language)),
            HumanMessage(content=prompt),
        ],
        RawTableTermsResult,
    )
    if result is None or not result.terms:
        logger.warning(
            "[%s] Using source-derived labels after term generation failed",
            table["name"],
        )
        return _fallback_result(table, specs, output_language)

    table_result = _sanitize_result(
        result, table=table, specs=specs, output_language=output_language
    )
    # Complete labels for columns omitted by the first prompt, including wide
    # tables, without asking the model to make a second decision about ownership.
    generated_columns = {
        attr.source_column.strip()
        for term in result.terms
        for attr in term.attributes
        if _normalize_label(attr.display_name, fallback="")
    }
    specs_by_column = {spec.source_column: spec for spec in specs}
    for term in table_result.terms:
        missing = [
            specs_by_column[attr.source_column]
            for attr in term.attributes
            if attr.source_column not in generated_columns
        ]
        labels = generate_column_labels(table, term.name, missing, output_language)
        for attr in term.attributes:
            if attr.source_column in labels:
                attr.display_name = labels[attr.source_column]
    apply_display_names_to_specs(table_result, specs)

    synonyms = _extract_synonyms(description)
    if synonyms:
        for term in table_result.terms:
            term.synonyms = synonyms

    return table_result
