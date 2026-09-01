from __future__ import annotations

from importlib import metadata
from pathlib import Path
import sys
import unittest

import pyarrow as pa
import pyarrow.parquet as pq


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.contracts import ContractViolation  # noqa: E402
from asha_financial_lab.parquet_transport import (  # noqa: E402
    MAX_PARQUET_BYTES,
    PARQUET_SCHEMA_VERSION,
    decode_synthetic_dataset_parquet,
    encode_synthetic_dataset_parquet,
)
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402


class SyntheticParquetTransportTests(unittest.TestCase):
    def test_reviewed_dependency_identity_is_exact(self) -> None:
        self.assertEqual(metadata.version("pyarrow"), "25.0.1")
        self.assertEqual(metadata.metadata("pyarrow")["License-Expression"], "Apache-2.0")

    def test_reference_dataset_round_trips_deterministically(self) -> None:
        dataset = build_reference_dataset()
        first = encode_synthetic_dataset_parquet(dataset)
        second = encode_synthetic_dataset_parquet(dataset)
        self.assertEqual(first, second)
        self.assertTrue(first.startswith(b"PAR1"))
        self.assertTrue(first.endswith(b"PAR1"))
        self.assertEqual(decode_synthetic_dataset_parquet(first), dataset)

    def test_wrong_metadata_and_corrupt_or_oversized_input_fail_closed(self) -> None:
        document = encode_synthetic_dataset_parquet(build_reference_dataset())
        table = pq.read_table(pa.BufferReader(document))
        wrong_metadata = dict(table.schema.metadata or {})
        wrong_metadata[b"asha.parquet.schema_version"] = b"unreviewed.version"
        tampered = table.replace_schema_metadata(wrong_metadata)
        sink = pa.BufferOutputStream()
        pq.write_table(tampered, sink, compression="NONE")
        with self.assertRaises(ContractViolation):
            decode_synthetic_dataset_parquet(sink.getvalue().to_pybytes())

        for invalid in (bytearray(document), b"", b"not parquet", b"x" * (MAX_PARQUET_BYTES + 1)):
            with self.subTest(value_type=type(invalid), length=len(invalid)):
                with self.assertRaises(ContractViolation):
                    decode_synthetic_dataset_parquet(invalid)

        compressed_sink = pa.BufferOutputStream()
        pq.write_table(table, compressed_sink, compression="snappy")
        with self.assertRaises(ContractViolation):
            decode_synthetic_dataset_parquet(compressed_sink.getvalue().to_pybytes())

    def test_schema_version_is_explicit_not_inferred(self) -> None:
        document = encode_synthetic_dataset_parquet(build_reference_dataset())
        schema = pq.ParquetFile(pa.BufferReader(document)).schema_arrow
        self.assertEqual(
            schema.metadata[b"asha.parquet.schema_version"].decode("ascii"),
            PARQUET_SCHEMA_VERSION,
        )


if __name__ == "__main__":
    unittest.main()
