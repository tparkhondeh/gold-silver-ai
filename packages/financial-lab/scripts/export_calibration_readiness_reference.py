"""Export the exact synthetic calibration-readiness reference for the web demo."""

from __future__ import annotations

from pathlib import Path
import sys


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from asha_financial_lab import (  # noqa: E402
    build_calibration_readiness_report,
    build_iran_calibration_manifest,
    build_parameter_freeze_bundle,
    build_synthetic_calibration_evidence,
    build_synthetic_calibration_preflight,
    encode_calibration_readiness_report,
)


TARGET = (
    REPOSITORY_ROOT
    / "apps"
    / "web"
    / "public"
    / "artifacts"
    / "calibration-readiness-report.v1.json"
)


def build_reference_bytes() -> bytes:
    manifest = build_iran_calibration_manifest()
    freeze = build_parameter_freeze_bundle(manifest)
    evidence = build_synthetic_calibration_evidence(manifest)
    preflight = build_synthetic_calibration_preflight(freeze, evidence, manifest)
    report = build_calibration_readiness_report(
        manifest, freeze, evidence, preflight
    )
    return encode_calibration_readiness_report(
        report, manifest, freeze, evidence, preflight
    )


def main() -> None:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_bytes(build_reference_bytes())
    print(TARGET)


if __name__ == "__main__":
    main()
