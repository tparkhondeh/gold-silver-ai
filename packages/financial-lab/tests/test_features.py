from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab.contracts import ContractViolation, fingerprint, seal_synthetic_dataset  # noqa: E402
from asha_financial_lab.artifacts import decode_return_matrix, encode_return_matrix  # noqa: E402
from asha_financial_lab.features import (  # noqa: E402
    RETURN_MATRIX_SCHEMA_VERSION,
    build_point_in_time_return_matrix,
    validate_point_in_time_return_matrix,
)
from asha_financial_lab.synthetic import build_reference_dataset  # noqa: E402


class PointInTimeFeatureTests(unittest.TestCase):
    def test_delayed_level_is_carried_then_caught_up_without_lookahead(self) -> None:
        matrix = build_point_in_time_return_matrix(build_reference_dataset(), 9, 11)
        rows = {row["periodIndex"]: row for row in matrix["rows"]}
        self.assertEqual(rows[10]["carriedForwardInstrumentIds"], ["SYNTH_VOLATILE"])
        volatile_10 = next(item for item in rows[10]["returns"] if item["instrumentId"] == "SYNTH_VOLATILE")
        volatile_11 = next(item for item in rows[11]["returns"] if item["instrumentId"] == "SYNTH_VOLATILE")
        self.assertEqual(volatile_10["value"], "0.000000000000")
        self.assertEqual(volatile_11["value"], "0.009638554217")
        self.assertEqual(rows[11]["carriedForwardInstrumentIds"], [])

    def test_reference_matrix_replays_exactly_and_remains_locked(self) -> None:
        dataset = build_reference_dataset()
        first = build_point_in_time_return_matrix(dataset, 2, 110)
        second = build_point_in_time_return_matrix(deepcopy(dataset), 2, 110)
        self.assertEqual(first, second)
        self.assertEqual(validate_point_in_time_return_matrix(first, dataset), first)
        self.assertFalse(first["financialUseAllowed"])
        self.assertEqual(first["methodologyReference"]["approvalState"], "unapproved")
        self.assertEqual(len(first["rows"]), 109)
        self.assertEqual(
            sum(len(row["carriedForwardInstrumentIds"]) for row in first["rows"]),
            11,
        )
        self.assertEqual(
            first["matrixId"],
            "ASHA_RETURN_MATRIX_dce2bb8bcff153a63f7573964d18e704cdff52c5464fb8c32562fc9780c5c22c",
        )

    def test_matrix_artifact_round_trips_only_with_its_exact_dataset(self) -> None:
        dataset = build_reference_dataset()
        matrix = build_point_in_time_return_matrix(dataset, 9, 11)
        document = encode_return_matrix(matrix, dataset)
        self.assertEqual(decode_return_matrix(document, dataset), matrix)

        other_dataset = deepcopy(dataset)
        other_dataset["observations"][0]["value"] = "101.00000000"
        other_dataset.pop("contentFingerprint")
        other_dataset = seal_synthetic_dataset(other_dataset)
        with self.assertRaises(ContractViolation):
            decode_return_matrix(document, other_dataset)

    def test_invalid_range_and_resealed_tampering_fail_closed(self) -> None:
        dataset = build_reference_dataset()
        for start, end in ((0, 2), (3, 2), (1, 120), (True, 2), (1, "2")):
            with self.subTest(start=start, end=end):
                with self.assertRaises(ValueError):
                    build_point_in_time_return_matrix(dataset, start, end)

        matrix = build_point_in_time_return_matrix(dataset, 9, 11)
        matrix["rows"][0]["returns"][0]["value"] = "9.000000000000"
        unsigned = {key: value for key, value in matrix.items() if key != "matrixId"}
        matrix["matrixId"] = f"ASHA_RETURN_MATRIX_{fingerprint(unsigned)}"
        with self.assertRaisesRegex(ContractViolation, "exact point-in-time replay"):
            validate_point_in_time_return_matrix(matrix, dataset)

    def test_machine_readable_schema_matches_runtime_version(self) -> None:
        schema = json.loads((PACKAGE_ROOT / "schemas/v1/return-matrix.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], RETURN_MATRIX_SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])


if __name__ == "__main__":
    unittest.main()
