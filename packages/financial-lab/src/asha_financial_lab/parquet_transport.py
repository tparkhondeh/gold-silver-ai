"""Bounded Parquet transport for validated synthetic observation tables."""

from __future__ import annotations

from decimal import Decimal
import json
from typing import Any

import pyarrow as pa
import pyarrow.parquet as pq

from .contracts import ContractViolation, canonical_json, validate_synthetic_dataset


PARQUET_SCHEMA_VERSION = "asha.synthetic.observations.parquet.v1"
MAX_PARQUET_BYTES = 64 * 1024 * 1024
_SCHEMA_VERSION_KEY = b"asha.parquet.schema_version"
_DATASET_MANIFEST_KEY = b"asha.dataset.manifest"
_OBSERVATION_SCHEMA = pa.schema([
    pa.field("observation_id", pa.string(), nullable=False),
    pa.field("instrument_id", pa.string(), nullable=False),
    pa.field("period_index", pa.int32(), nullable=False),
    pa.field("available_at_index", pa.int32(), nullable=False),
    pa.field("value", pa.decimal128(20, 8), nullable=False),
])


def _unique_mapping(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ContractViolation(f"duplicate Parquet manifest key is not allowed: {key}")
        result[key] = value
    return result


def _manifest(dataset: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in dataset.items() if key != "observations"}


def encode_synthetic_dataset_parquet(dataset_payload: object) -> bytes:
    """Encode a validated dataset without treating Parquet bytes as canonical identity."""

    dataset = validate_synthetic_dataset(dataset_payload)
    metadata = {
        _SCHEMA_VERSION_KEY: PARQUET_SCHEMA_VERSION.encode("ascii"),
        _DATASET_MANIFEST_KEY: canonical_json(_manifest(dataset)).encode("utf-8"),
    }
    schema = _OBSERVATION_SCHEMA.with_metadata(metadata)
    observations = dataset["observations"]
    table = pa.Table.from_arrays([
        pa.array((row["observationId"] for row in observations), type=pa.string()),
        pa.array((row["instrumentId"] for row in observations), type=pa.string()),
        pa.array((row["periodIndex"] for row in observations), type=pa.int32()),
        pa.array((row["availableAtIndex"] for row in observations), type=pa.int32()),
        pa.array((Decimal(row["value"]) for row in observations), type=pa.decimal128(20, 8)),
    ], schema=schema)
    sink = pa.BufferOutputStream()
    pq.write_table(
        table,
        sink,
        compression="NONE",
        data_page_version="2.0",
        use_dictionary=False,
        version="2.6",
        write_statistics=True,
    )
    document = sink.getvalue().to_pybytes()
    if len(document) > MAX_PARQUET_BYTES:
        raise ContractViolation("encoded synthetic Parquet artifact exceeds the size boundary")
    return document


def decode_synthetic_dataset_parquet(document: object) -> dict[str, Any]:
    """Decode only the reviewed schema and revalidate the original JSON identity."""

    if type(document) is not bytes or not 0 < len(document) <= MAX_PARQUET_BYTES:
        raise ContractViolation("Parquet artifact must be bounded non-empty bytes")
    try:
        parquet_file = pq.ParquetFile(pa.BufferReader(document))
        file_metadata = parquet_file.metadata
        if (
            file_metadata.num_rows > 100_000
            or file_metadata.num_columns != len(_OBSERVATION_SCHEMA)
            or file_metadata.num_row_groups > 1024
            or sum(file_metadata.row_group(index).total_byte_size for index in range(file_metadata.num_row_groups))
            > MAX_PARQUET_BYTES
        ):
            raise ContractViolation("Parquet artifact dimensions exceed the reviewed contract")
        if any(
            file_metadata.row_group(row_group).column(column).compression != "UNCOMPRESSED"
            for row_group in range(file_metadata.num_row_groups)
            for column in range(file_metadata.num_columns)
        ):
            raise ContractViolation("compressed Parquet input is outside the reviewed transport contract")
        schema = parquet_file.schema_arrow
        if schema.remove_metadata() != _OBSERVATION_SCHEMA:
            raise ContractViolation("Parquet observation schema is not the reviewed exact schema")
        metadata = schema.metadata
        if metadata is None or set(metadata) != {_SCHEMA_VERSION_KEY, _DATASET_MANIFEST_KEY}:
            raise ContractViolation("Parquet metadata keys are not the reviewed exact set")
        if metadata[_SCHEMA_VERSION_KEY] != PARQUET_SCHEMA_VERSION.encode("ascii"):
            raise ContractViolation("unsupported synthetic Parquet schema version")
        manifest_text = metadata[_DATASET_MANIFEST_KEY].decode("utf-8", errors="strict")
        manifest = json.loads(manifest_text, object_pairs_hook=_unique_mapping)
        if manifest_text != canonical_json(manifest):
            raise ContractViolation("Parquet dataset manifest is not canonical JSON")
        table = parquet_file.read()
    except ContractViolation:
        raise
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, pa.ArrowException) as error:
        raise ContractViolation("Parquet artifact is malformed or unreadable") from error

    observations = [
        {
            "observationId": row["observation_id"],
            "instrumentId": row["instrument_id"],
            "periodIndex": row["period_index"],
            "availableAtIndex": row["available_at_index"],
            "value": f"{row['value']:.8f}",
        }
        for row in table.to_pylist()
    ]
    if not isinstance(manifest, dict):
        raise ContractViolation("Parquet dataset manifest must be an object")
    return validate_synthetic_dataset({**manifest, "observations": observations})
