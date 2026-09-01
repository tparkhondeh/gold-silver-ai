"""First deterministic baseline: point-in-time coverage with no decision output."""

from __future__ import annotations

from .contracts import RESULT_SCHEMA_VERSION, seal_evaluation_result, validate_synthetic_dataset


BASELINE_MODEL_ID = "ASHA_DETERMINISTIC_BASELINE_V1"
NO_DECISION_BENCHMARK_ID = "ASHA_BENCHMARK_NO_DECISION_V1"


def evaluate_no_decision(dataset_payload: object, cutoff_index: int) -> dict:
    """Count only observations known by a cutoff and emit a permanently locked result."""

    dataset = validate_synthetic_dataset(dataset_payload)
    if type(cutoff_index) is not int or cutoff_index < 0:
        raise ValueError("cutoff_index must be a non-negative integer")
    maximum_period = max(row["periodIndex"] for row in dataset["observations"])
    if cutoff_index > maximum_period:
        raise ValueError("cutoff_index exceeds the synthetic dataset")

    available = [
        row for row in dataset["observations"]
        if row["periodIndex"] <= cutoff_index and row["availableAtIndex"] <= cutoff_index
    ]
    covered_instruments = {row["instrumentId"] for row in available}

    return seal_evaluation_result({
        "schemaVersion": RESULT_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "executionAllowed": False,
        "decisionState": "no_decision",
        "riskState": "execution_disabled",
        "datasetReference": {
            "datasetId": dataset["datasetId"],
            "version": dataset["datasetVersion"],
            "contentFingerprint": dataset["contentFingerprint"],
        },
        "modelReference": {
            "entityId": BASELINE_MODEL_ID,
            "version": 1,
            "lifecycle": "evaluation_only",
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "assumptionReferences": dataset["assumptionReferences"],
        "benchmarkResults": [{
            "benchmarkId": NO_DECISION_BENCHMARK_ID,
            "status": "computed",
            "metrics": {
                "available_observation_count": str(len(available)),
                "cutoff_index": str(cutoff_index),
                "instrument_count": str(len(covered_instruments)),
            },
            "reasonCodes": [],
        }],
        "reasonCodes": [
            "METHODOLOGY_NOT_APPROVED",
            "NO_DECISION_BASELINE",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
        ],
    })
