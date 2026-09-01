"""Versioned, parameterized walk-forward mechanics for synthetic evaluation only."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any

from .contracts import ContractViolation, fingerprint, validate_synthetic_dataset


WALK_FORWARD_SCHEMA_VERSION = "asha.synthetic.walk_forward_plan.v1"
_PLAN_ID = re.compile(r"ASHA_WALK_FORWARD_[a-f0-9]{64}\Z")
_PARAMETER_KEYS = {
    "minimumTrainPeriods",
    "testPeriods",
    "stepPeriods",
    "purgePeriods",
    "embargoPeriods",
    "mode",
}
_PLAN_KEYS = {
    "schemaVersion",
    "planId",
    "status",
    "financialUseAllowed",
    "datasetReference",
    "methodologyReference",
    "parameters",
    "folds",
    "reasonCodes",
}
_FOLD_KEYS = {
    "foldIndex",
    "trainStartIndex",
    "trainEndIndex",
    "trainingAvailabilityCutoffIndex",
    "trainObservationCount",
    "trainObservationFingerprint",
    "purgeStartIndex",
    "purgeEndIndex",
    "testStartIndex",
    "testEndIndex",
    "embargoStartIndex",
    "embargoEndIndex",
}


def _integer(value: object, label: str, minimum: int) -> int:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{label} must be an integer >= {minimum}")
    return value


def _parameters(
    minimum_train_periods: object,
    test_periods: object,
    step_periods: object,
    purge_periods: object,
    embargo_periods: object,
    mode: object,
) -> dict[str, Any]:
    minimum_train = _integer(minimum_train_periods, "minimum_train_periods", 3)
    test = _integer(test_periods, "test_periods", 1)
    step = _integer(step_periods, "step_periods", 1)
    purge = _integer(purge_periods, "purge_periods", 0)
    embargo = _integer(embargo_periods, "embargo_periods", 0)
    if not isinstance(mode, str) or mode not in {"rolling", "anchored"}:
        raise ValueError("mode must be rolling or anchored")
    if step < test + embargo:
        raise ValueError("step_periods must prevent test overlap and respect embargo")
    return {
        "minimumTrainPeriods": minimum_train,
        "testPeriods": test,
        "stepPeriods": step,
        "purgePeriods": purge,
        "embargoPeriods": embargo,
        "mode": mode,
    }


def _build_unsigned(dataset: dict[str, Any], parameters: dict[str, Any]) -> dict[str, Any]:
    periods = sorted({row["periodIndex"] for row in dataset["observations"]})
    if periods != list(range(periods[-1] + 1)):
        raise ContractViolation("walk-forward mechanics require contiguous synthetic period indices from zero")

    minimum_train = parameters["minimumTrainPeriods"]
    test = parameters["testPeriods"]
    step = parameters["stepPeriods"]
    purge = parameters["purgePeriods"]
    embargo = parameters["embargoPeriods"]
    maximum_period = periods[-1]
    test_start = minimum_train + purge
    folds: list[dict[str, Any]] = []

    while test_start + test - 1 <= maximum_period:
        train_end = test_start - purge - 1
        train_start = 0 if parameters["mode"] == "anchored" else train_end - minimum_train + 1
        test_end = test_start + test - 1
        training_ids = sorted(
            row["observationId"]
            for row in dataset["observations"]
            if train_start <= row["periodIndex"] <= train_end
            and row["availableAtIndex"] <= train_end
        )
        training_id_set = set(training_ids)
        trained_instruments = {
            row["instrumentId"]
            for row in dataset["observations"]
            if row["observationId"] in training_id_set
        }
        if trained_instruments != {item["instrumentId"] for item in dataset["instruments"]}:
            raise ContractViolation("every fold must contain then-available training data for every instrument")

        embargo_start = test_end + 1 if embargo > 0 and test_end < maximum_period else None
        embargo_end = min(test_end + embargo, maximum_period) if embargo_start is not None else None
        folds.append({
            "foldIndex": len(folds),
            "trainStartIndex": train_start,
            "trainEndIndex": train_end,
            "trainingAvailabilityCutoffIndex": train_end,
            "trainObservationCount": len(training_ids),
            "trainObservationFingerprint": fingerprint({"observationIds": training_ids}),
            "purgeStartIndex": train_end + 1 if purge > 0 else None,
            "purgeEndIndex": test_start - 1 if purge > 0 else None,
            "testStartIndex": test_start,
            "testEndIndex": test_end,
            "embargoStartIndex": embargo_start,
            "embargoEndIndex": embargo_end,
        })
        test_start += step

    if not folds:
        raise ValueError("walk-forward parameters do not produce a complete synthetic fold")

    return {
        "schemaVersion": WALK_FORWARD_SCHEMA_VERSION,
        "status": "evaluation_only",
        "financialUseAllowed": False,
        "datasetReference": {
            "datasetId": dataset["datasetId"],
            "version": dataset["datasetVersion"],
            "contentFingerprint": dataset["contentFingerprint"],
        },
        "methodologyReference": {
            "entityId": "STATUS_TBD",
            "version": 0,
            "approvalState": "unapproved",
        },
        "parameters": deepcopy(parameters),
        "folds": folds,
        "reasonCodes": [
            "METHODOLOGY_NOT_APPROVED",
            "REAL_FINANCIAL_USE_DISABLED",
            "SYNTHETIC_DATA_ONLY",
            "WALK_FORWARD_MECHANICS_ONLY",
        ],
    }


def build_walk_forward_plan(
    dataset_payload: object,
    *,
    minimum_train_periods: object,
    test_periods: object,
    step_periods: object,
    purge_periods: object,
    embargo_periods: object,
    mode: object,
) -> dict[str, Any]:
    """Build a deterministic plan without choosing any financial methodology."""

    dataset = validate_synthetic_dataset(dataset_payload)
    parameters = _parameters(
        minimum_train_periods,
        test_periods,
        step_periods,
        purge_periods,
        embargo_periods,
        mode,
    )
    unsigned = _build_unsigned(dataset, parameters)
    plan = {**unsigned, "planId": f"ASHA_WALK_FORWARD_{fingerprint(unsigned)}"}
    return validate_walk_forward_plan(plan, dataset)


def validate_walk_forward_plan(plan_payload: object, dataset_payload: object) -> dict[str, Any]:
    """Validate identity and recompute every fold against the referenced dataset."""

    dataset = validate_synthetic_dataset(dataset_payload)
    if not isinstance(plan_payload, dict) or set(plan_payload) != _PLAN_KEYS:
        raise ContractViolation("walk-forward plan has unexpected fields")
    plan = deepcopy(plan_payload)
    if plan["schemaVersion"] != WALK_FORWARD_SCHEMA_VERSION:
        raise ContractViolation("unsupported walk-forward schema version")
    if plan["status"] != "evaluation_only" or plan["financialUseAllowed"] is not False:
        raise ContractViolation("walk-forward plan must remain evaluation-only")
    if plan["methodologyReference"] != {
        "entityId": "STATUS_TBD",
        "version": 0,
        "approvalState": "unapproved",
    }:
        raise ContractViolation("walk-forward plan cannot approve a methodology")
    expected_reference = {
        "datasetId": dataset["datasetId"],
        "version": dataset["datasetVersion"],
        "contentFingerprint": dataset["contentFingerprint"],
    }
    if plan["datasetReference"] != expected_reference:
        raise ContractViolation("walk-forward plan references a different dataset")
    if not isinstance(plan["parameters"], dict) or set(plan["parameters"]) != _PARAMETER_KEYS:
        raise ContractViolation("walk-forward parameters have unexpected fields")
    try:
        parameters = _parameters(
            plan["parameters"]["minimumTrainPeriods"],
            plan["parameters"]["testPeriods"],
            plan["parameters"]["stepPeriods"],
            plan["parameters"]["purgePeriods"],
            plan["parameters"]["embargoPeriods"],
            plan["parameters"]["mode"],
        )
    except ValueError as error:
        raise ContractViolation("walk-forward parameters are invalid") from error
    if not isinstance(plan["folds"], list) or not plan["folds"]:
        raise ContractViolation("walk-forward plan needs at least one fold")
    if any(not isinstance(fold, dict) or set(fold) != _FOLD_KEYS for fold in plan["folds"]):
        raise ContractViolation("walk-forward fold has unexpected fields")
    if plan["reasonCodes"] != [
        "METHODOLOGY_NOT_APPROVED",
        "REAL_FINANCIAL_USE_DISABLED",
        "SYNTHETIC_DATA_ONLY",
        "WALK_FORWARD_MECHANICS_ONLY",
    ]:
        raise ContractViolation("walk-forward plan is missing permanent safety reasons")
    plan_id = plan["planId"]
    unsigned = {key: value for key, value in plan.items() if key != "planId"}
    if not isinstance(plan_id, str) or not _PLAN_ID.fullmatch(plan_id):
        raise ContractViolation("walk-forward plan ID is invalid")
    if plan_id != f"ASHA_WALK_FORWARD_{fingerprint(unsigned)}":
        raise ContractViolation("walk-forward plan fingerprint mismatch")
    if unsigned != _build_unsigned(dataset, parameters):
        raise ContractViolation("walk-forward folds do not match exact deterministic replay")
    return plan
