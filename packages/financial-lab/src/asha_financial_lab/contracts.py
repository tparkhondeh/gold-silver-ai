"""Fail-closed, versioned contracts for the synthetic-only laboratory."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal, InvalidOperation
from hashlib import sha256
import json
import re
from typing import Any


DATASET_SCHEMA_VERSION = "asha.synthetic.dataset.v1"
RESULT_SCHEMA_VERSION = "asha.evaluation.result.v1"

_DATASET_ID = re.compile(r"ASHA_SYNTHETIC_[A-Z0-9_]{3,64}_V[1-9][0-9]*\Z")
_INSTRUMENT_ID = re.compile(r"SYNTH_[A-Z0-9_]{2,64}\Z")
_OBSERVATION_ID = re.compile(r"SYNTH_OBS_[A-Z0-9_]{3,80}\Z")
_ASSUMPTION_ID = re.compile(r"ASHA_SYNTHETIC_ASSUMPTION_[A-Z0-9_]{2,64}\Z")
_MODEL_ID = re.compile(r"ASHA_[A-Z0-9_]{3,80}_V[1-9][0-9]*\Z")
_BENCHMARK_ID = re.compile(r"ASHA_BENCHMARK_[A-Z0-9_]{2,64}_V[1-9][0-9]*\Z")
_REASON_CODE = re.compile(r"[A-Z][A-Z0-9_]{2,80}\Z")
_METRIC_ID = re.compile(r"[a-z][a-z0-9_]{2,64}\Z")
_DECIMAL = re.compile(r"(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,8})?\Z")
_SIGNED_DECIMAL = re.compile(r"-?(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,8})?\Z")
_REQUIRED_RESULT_REASONS = {
    "METHODOLOGY_NOT_APPROVED",
    "REAL_FINANCIAL_USE_DISABLED",
    "SYNTHETIC_DATA_ONLY",
}


class ContractViolation(ValueError):
    """Raised when an input attempts to cross a laboratory safety boundary."""


def canonical_json(value: Any) -> str:
    """Return one deterministic JSON representation for hashing and replay."""

    try:
        return json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise ContractViolation("contract value is not canonical JSON") from error


def fingerprint(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _exact_mapping(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ContractViolation(f"{label} must contain exactly {sorted(keys)}")
    if not all(isinstance(key, str) for key in value):
        raise ContractViolation(f"{label} keys must be strings")
    return value


def _bounded_text(value: Any, label: str, minimum: int = 1, maximum: int = 160) -> str:
    if not isinstance(value, str) or not minimum <= len(value) <= maximum or value != value.strip():
        raise ContractViolation(f"{label} is not a bounded normalized string")
    return value


def _integer(value: Any, label: str, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        raise ContractViolation(f"{label} must be an integer >= {minimum}")
    return value


def _decimal_string(value: Any, label: str, *, positive: bool = False, signed: bool = False) -> str:
    pattern = _SIGNED_DECIMAL if signed else _DECIMAL
    if not isinstance(value, str) or not pattern.fullmatch(value) or value == "-0":
        raise ContractViolation(f"{label} must be a plain bounded decimal string")
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ContractViolation(f"{label} is not decimal") from error
    if not parsed.is_finite() or (parsed == 0 and value.startswith("-")) or (positive and parsed <= 0):
        raise ContractViolation(f"{label} must be finite and positive")
    return value


def _validate_assumption_references(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ContractViolation("assumptionReferences must be an array")
    references: list[dict[str, Any]] = []
    identities: list[tuple[str, int]] = []
    for index, item in enumerate(value):
        reference = _exact_mapping(item, {"entityId", "version", "status"}, f"assumptionReferences[{index}]")
        entity_id = reference["entityId"]
        if not isinstance(entity_id, str) or not _ASSUMPTION_ID.fullmatch(entity_id):
            raise ContractViolation("laboratory assumption IDs must use the synthetic namespace")
        version = _integer(reference["version"], "assumption version", 1)
        if reference["status"] != "synthetic_only":
            raise ContractViolation("laboratory assumptions must remain synthetic_only")
        identities.append((entity_id, version))
        references.append(reference)
    if identities != sorted(set(identities)):
        raise ContractViolation("assumption references must be unique and sorted")
    return references


def validate_synthetic_dataset(payload: Any) -> dict[str, Any]:
    dataset = _exact_mapping(payload, {
        "schemaVersion", "datasetId", "datasetVersion", "datasetKind", "purpose",
        "financialUseAllowed", "instruments", "observations", "assumptionReferences",
        "contentFingerprint",
    }, "synthetic dataset")
    if dataset["schemaVersion"] != DATASET_SCHEMA_VERSION:
        raise ContractViolation("unsupported synthetic dataset schema version")
    dataset_id = dataset["datasetId"]
    if not isinstance(dataset_id, str) or not _DATASET_ID.fullmatch(dataset_id):
        raise ContractViolation("datasetId must use the ASHA_SYNTHETIC namespace")
    _integer(dataset["datasetVersion"], "datasetVersion", 1)
    if dataset["datasetKind"] != "synthetic_fixture":
        raise ContractViolation("only synthetic_fixture datasets enter this laboratory")
    if dataset["purpose"] not in {"contract_test", "benchmark_evaluation", "walk_forward_mechanics_test"}:
        raise ContractViolation("dataset purpose is not approved for the synthetic laboratory")
    if dataset["financialUseAllowed"] is not False:
        raise ContractViolation("synthetic datasets can never allow financial use")

    instruments = dataset["instruments"]
    if not isinstance(instruments, list) or not 1 <= len(instruments) <= 64:
        raise ContractViolation("instruments must contain between 1 and 64 synthetic entries")
    instrument_ids: list[str] = []
    for index, item in enumerate(instruments):
        instrument = _exact_mapping(item, {"instrumentId", "displayName", "unit"}, f"instruments[{index}]")
        instrument_id = instrument["instrumentId"]
        if not isinstance(instrument_id, str) or not _INSTRUMENT_ID.fullmatch(instrument_id):
            raise ContractViolation("instrument IDs must use the SYNTH_ namespace")
        if not _bounded_text(instrument["displayName"], "synthetic displayName").startswith("[SYNTHETIC] "):
            raise ContractViolation("synthetic display names must carry an explicit label")
        if instrument["unit"] != "synthetic_index_point":
            raise ContractViolation("synthetic instruments use only synthetic_index_point")
        instrument_ids.append(instrument_id)
    if instrument_ids != sorted(set(instrument_ids)):
        raise ContractViolation("synthetic instruments must be unique and sorted")

    observations = dataset["observations"]
    if not isinstance(observations, list) or not 3 <= len(observations) <= 100_000:
        raise ContractViolation("observations must contain between 3 and 100000 rows")
    observation_ids: set[str] = set()
    instrument_periods: set[tuple[str, int]] = set()
    order: list[tuple[int, str, str]] = []
    counts = {instrument_id: 0 for instrument_id in instrument_ids}
    for index, item in enumerate(observations):
        observation = _exact_mapping(
            item,
            {"observationId", "instrumentId", "periodIndex", "availableAtIndex", "value"},
            f"observations[{index}]",
        )
        observation_id = observation["observationId"]
        if not isinstance(observation_id, str) or not _OBSERVATION_ID.fullmatch(observation_id):
            raise ContractViolation("observation IDs must use the SYNTH_OBS_ namespace")
        instrument_id = observation["instrumentId"]
        if instrument_id not in counts:
            raise ContractViolation("observation references an unknown synthetic instrument")
        period_index = _integer(observation["periodIndex"], "periodIndex")
        available_at = _integer(observation["availableAtIndex"], "availableAtIndex")
        if available_at < period_index:
            raise ContractViolation("availability cannot precede its synthetic observation period")
        _decimal_string(observation["value"], "synthetic value", positive=True)
        if observation_id in observation_ids or (instrument_id, period_index) in instrument_periods:
            raise ContractViolation("synthetic observations must be unique")
        observation_ids.add(observation_id)
        instrument_periods.add((instrument_id, period_index))
        order.append((period_index, instrument_id, observation_id))
        counts[instrument_id] += 1
    if order != sorted(order):
        raise ContractViolation("synthetic observations must be ordered by period and instrument")
    if any(count < 3 for count in counts.values()):
        raise ContractViolation("every synthetic instrument needs at least three observations")

    _validate_assumption_references(dataset["assumptionReferences"])
    supplied_fingerprint = dataset["contentFingerprint"]
    if not isinstance(supplied_fingerprint, str) or not re.fullmatch(r"[a-f0-9]{64}", supplied_fingerprint):
        raise ContractViolation("contentFingerprint must be lowercase SHA-256")
    unsigned = {key: value for key, value in dataset.items() if key != "contentFingerprint"}
    if fingerprint(unsigned) != supplied_fingerprint:
        raise ContractViolation("synthetic dataset fingerprint mismatch")
    return deepcopy(dataset)


def seal_synthetic_dataset(unsigned_payload: Any) -> dict[str, Any]:
    unsigned = _exact_mapping(unsigned_payload, {
        "schemaVersion", "datasetId", "datasetVersion", "datasetKind", "purpose",
        "financialUseAllowed", "instruments", "observations", "assumptionReferences",
    }, "unsigned synthetic dataset")
    sealed = deepcopy(unsigned)
    sealed["contentFingerprint"] = fingerprint(sealed)
    return validate_synthetic_dataset(sealed)


def validate_evaluation_result(payload: Any) -> dict[str, Any]:
    result = _exact_mapping(payload, {
        "schemaVersion", "resultId", "status", "financialUseAllowed", "executionAllowed",
        "decisionState", "riskState", "datasetReference", "modelReference",
        "methodologyReference", "assumptionReferences", "benchmarkResults", "reasonCodes",
    }, "evaluation result")
    if result["schemaVersion"] != RESULT_SCHEMA_VERSION or result["status"] != "evaluation_only":
        raise ContractViolation("result must use the evaluation-only v1 contract")
    if result["financialUseAllowed"] is not False or result["executionAllowed"] is not False:
        raise ContractViolation("laboratory results cannot allow financial use or execution")
    if result["decisionState"] != "no_decision" or result["riskState"] != "execution_disabled":
        raise ContractViolation("laboratory results must remain no_decision and execution_disabled")

    dataset_ref = _exact_mapping(result["datasetReference"], {"datasetId", "version", "contentFingerprint"}, "datasetReference")
    if not isinstance(dataset_ref["datasetId"], str) or not _DATASET_ID.fullmatch(dataset_ref["datasetId"]):
        raise ContractViolation("result dataset must remain synthetic")
    _integer(dataset_ref["version"], "dataset reference version", 1)
    if not isinstance(dataset_ref["contentFingerprint"], str) or not re.fullmatch(r"[a-f0-9]{64}", dataset_ref["contentFingerprint"]):
        raise ContractViolation("result dataset fingerprint is invalid")

    model_ref = _exact_mapping(result["modelReference"], {"entityId", "version", "lifecycle"}, "modelReference")
    if not isinstance(model_ref["entityId"], str) or not _MODEL_ID.fullmatch(model_ref["entityId"]):
        raise ContractViolation("model reference is invalid")
    _integer(model_ref["version"], "model reference version", 1)
    if model_ref["lifecycle"] != "evaluation_only":
        raise ContractViolation("laboratory model lifecycle must remain evaluation_only")

    methodology_ref = _exact_mapping(result["methodologyReference"], {"entityId", "version", "approvalState"}, "methodologyReference")
    if methodology_ref != {"entityId": "STATUS_TBD", "version": 0, "approvalState": "unapproved"}:
        raise ContractViolation("no financial methodology is approved in the synthetic laboratory")
    _validate_assumption_references(result["assumptionReferences"])

    benchmarks = result["benchmarkResults"]
    if not isinstance(benchmarks, list) or len(benchmarks) > 32:
        raise ContractViolation("benchmarkResults must be a bounded array")
    benchmark_ids: list[str] = []
    for index, item in enumerate(benchmarks):
        benchmark = _exact_mapping(item, {"benchmarkId", "status", "metrics", "reasonCodes"}, f"benchmarkResults[{index}]")
        benchmark_id = benchmark["benchmarkId"]
        if not isinstance(benchmark_id, str) or not _BENCHMARK_ID.fullmatch(benchmark_id):
            raise ContractViolation("benchmark ID is invalid")
        if benchmark["status"] not in {"computed", "not_computable"} or not isinstance(benchmark["metrics"], dict):
            raise ContractViolation("benchmark status or metrics are invalid")
        for metric_id, value in benchmark["metrics"].items():
            if not isinstance(metric_id, str) or not _METRIC_ID.fullmatch(metric_id):
                raise ContractViolation("benchmark metric ID is invalid")
            _decimal_string(value, f"benchmark metric {metric_id}", signed=True)
        reasons = benchmark["reasonCodes"]
        if not isinstance(reasons, list) or reasons != sorted(set(reasons)) or any(not isinstance(reason, str) or not _REASON_CODE.fullmatch(reason) for reason in reasons):
            raise ContractViolation("benchmark reason codes must be unique, sorted, and bounded")
        if benchmark["status"] == "computed" and not benchmark["metrics"]:
            raise ContractViolation("a computed benchmark needs at least one metric")
        if benchmark["status"] == "not_computable" and (benchmark["metrics"] or not reasons):
            raise ContractViolation("a non-computable benchmark needs reasons and no metrics")
        benchmark_ids.append(benchmark_id)
    if benchmark_ids != sorted(set(benchmark_ids)):
        raise ContractViolation("benchmark results must be unique and sorted")

    reason_codes = result["reasonCodes"]
    if not isinstance(reason_codes, list) or reason_codes != sorted(set(reason_codes)):
        raise ContractViolation("result reason codes must be unique and sorted")
    if any(not isinstance(reason, str) or not _REASON_CODE.fullmatch(reason) for reason in reason_codes):
        raise ContractViolation("result reason code is invalid")
    if not _REQUIRED_RESULT_REASONS.issubset(reason_codes):
        raise ContractViolation("laboratory result is missing permanent safety reasons")

    result_id = result["resultId"]
    unsigned = {key: value for key, value in result.items() if key != "resultId"}
    if result_id != f"ASHA_EVAL_{fingerprint(unsigned)}":
        raise ContractViolation("evaluation result fingerprint mismatch")
    return deepcopy(result)


def seal_evaluation_result(unsigned_payload: Any) -> dict[str, Any]:
    unsigned = _exact_mapping(unsigned_payload, {
        "schemaVersion", "status", "financialUseAllowed", "executionAllowed",
        "decisionState", "riskState", "datasetReference", "modelReference",
        "methodologyReference", "assumptionReferences", "benchmarkResults", "reasonCodes",
    }, "unsigned evaluation result")
    sealed = deepcopy(unsigned)
    sealed["resultId"] = f"ASHA_EVAL_{fingerprint(sealed)}"
    return validate_evaluation_result(sealed)
