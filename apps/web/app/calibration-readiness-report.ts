export const CALIBRATION_READINESS_REFERENCE_PATH =
  "/artifacts/calibration-readiness-report.v1.json";
export const CALIBRATION_READINESS_SCHEMA_VERSION =
  "asha.synthetic.calibration_readiness_report.v1";
export const CALIBRATION_READINESS_REFERENCE_ID =
  "ASHA_SYNTHETIC_CALIBRATION_READINESS_26699dff57aaabefb2349b33465079cfd5b676e8a065270aedfe7fe9ab6cccf7";

const gateDefinitions = [
  ["G01_SYNTHETIC_REAL_ISOLATION", "data"],
  ["G02_LICENSE_AND_PROVENANCE", "data"],
  ["G03_POINT_IN_TIME_INTEGRITY", "data"],
  ["G04_HISTORY_AND_COVERAGE", "data"],
  ["G05_IRAN_MARKET_EVIDENCE", "data"],
  ["G06_TRAIN_VALIDATION_TEST_ISOLATION", "fit"],
  ["G07_PARAMETER_FREEZE", "fit"],
  ["G08_OUT_OF_SAMPLE_REPLAY", "test"],
  ["G09_PREDECLARED_ACCEPTANCE", "test"],
  ["G10_SHADOW_AND_OWNER_APPROVAL", "promotion"],
] as const;

type MechanicalState = "passed" | "failed" | "blocked";

export type CalibrationReadinessEvidence = {
  evidenceId: string;
  ownerLabelFa: string;
  state: "required_not_supplied";
};

export type CalibrationReadinessGate = {
  gateId: (typeof gateDefinitions)[number][0];
  stage: (typeof gateDefinitions)[number][1];
  ownerTitleFa: string;
  ownerStateFa: string;
  ownerExplanationFa: string;
  syntheticMechanicalState: MechanicalState;
  realWorldState: "not_evaluated";
  remainingEvidenceCount: number;
  remainingEvidence: CalibrationReadinessEvidence[];
};

export type CalibrationReadinessReport = {
  schemaVersion: typeof CALIBRATION_READINESS_SCHEMA_VERSION;
  reportId: typeof CALIBRATION_READINESS_REFERENCE_ID;
  status: "synthetic_owner_readiness_view_only";
  generatedFrom: {
    manifestId: string;
    freezeBundleId: string;
    evidenceBundleId: string;
    gateResultId: string;
    preflightId: string;
  };
  gateReadiness: CalibrationReadinessGate[];
  summary: {
    ownerHeadlineFa: string;
    ownerNextBoundaryFa: string;
    syntheticGateMechanicsState: MechanicalState;
    syntheticPreflightMechanicalState: MechanicalState;
    realCalibrationState: "not_evaluated";
    realReadinessState: "blocked_until_licensed_iran_evidence";
    performanceClaimState: "not_evaluated";
    promotionState: "blocked_in_synthetic_readiness_report";
  };
  boundary: {
    containsMarketObservations: false;
    containsProviderSelection: false;
    containsProviderCredentials: false;
    realDataRequestCreated: false;
    methodScoreProduced: false;
    methodRankingProduced: false;
    performanceClaimAllowed: false;
    thresholdSelectionAllowed: false;
  };
  financialUseAllowed: false;
  executionAllowed: false;
  parameterMutationAllowed: false;
};

type JsonRecord = Record<string, unknown>;

function exactRecord(value: unknown, keys: readonly string[], label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} نامعتبر است`);
  }
  const record = value as JsonRecord;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} فیلد غیرمنتظره یا مفقود دارد`);
  }
  return record;
}

function nonEmptyText(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > 240) {
    throw new Error(`${label} متن معتبر ندارد`);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error("عدد غیرقابل بازتولید است");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as JsonRecord;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error("مقدار خارج از قرارداد JSON است");
}

async function sha256(value: string) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateIdentity(value: unknown, pattern: RegExp, label: string) {
  const identity = nonEmptyText(value, label);
  if (!pattern.test(identity)) throw new Error(`${label} با قرارداد مرجع یکسان نیست`);
  return identity;
}

const topKeys = [
  "schemaVersion", "reportId", "status", "generatedFrom", "gateReadiness",
  "summary", "boundary", "financialUseAllowed", "executionAllowed",
  "parameterMutationAllowed",
] as const;

export async function validateCalibrationReadinessReport(
  value: unknown,
): Promise<CalibrationReadinessReport> {
  const report = exactRecord(value, topKeys, "گزارش آمادگی کالیبراسیون");
  if (report.schemaVersion !== CALIBRATION_READINESS_SCHEMA_VERSION
    || report.status !== "synthetic_owner_readiness_view_only"
    || report.reportId !== CALIBRATION_READINESS_REFERENCE_ID) {
    throw new Error("نسخه یا هویت گزارش مرجع معتبر نیست");
  }

  const unsigned = Object.fromEntries(
    Object.entries(report).filter(([key]) => key !== "reportId"),
  );
  const computedId = `ASHA_SYNTHETIC_CALIBRATION_READINESS_${await sha256(canonicalJson(unsigned))}`;
  if (computedId !== report.reportId) throw new Error("اثر انگشت گزارش با محتوا یکسان نیست");

  const generatedFrom = exactRecord(
    report.generatedFrom,
    ["manifestId", "freezeBundleId", "evidenceBundleId", "gateResultId", "preflightId"],
    "زنجیرهٔ تولید گزارش",
  );
  validateIdentity(generatedFrom.manifestId, /^ASHA_IRAN_CALIBRATION_MANIFEST_[a-f0-9]{64}$/, "شناسهٔ مانیفست");
  validateIdentity(generatedFrom.freezeBundleId, /^ASHA_SYNTHETIC_PARAMETER_FREEZE_[a-f0-9]{64}$/, "شناسهٔ قفل پارامترها");
  validateIdentity(generatedFrom.evidenceBundleId, /^ASHA_SYNTHETIC_CALIBRATION_EVIDENCE_[a-f0-9]{64}$/, "شناسهٔ شواهد ساختگی");
  validateIdentity(generatedFrom.gateResultId, /^ASHA_SYNTHETIC_CALIBRATION_GATE_RESULT_[a-f0-9]{64}$/, "شناسهٔ نتیجهٔ دروازه‌ها");
  validateIdentity(generatedFrom.preflightId, /^ASHA_SYNTHETIC_CALIBRATION_PREFLIGHT_[a-f0-9]{64}$/, "شناسهٔ پیش‌پرواز");

  if (!Array.isArray(report.gateReadiness) || report.gateReadiness.length !== gateDefinitions.length) {
    throw new Error("هر ده دروازه باید دقیقاً موجود باشند");
  }
  const seenEvidence = new Set<string>();
  let evidenceCount = 0;
  report.gateReadiness.forEach((value, index) => {
    const gate = exactRecord(value, [
      "gateId", "stage", "ownerTitleFa", "ownerStateFa", "ownerExplanationFa",
      "syntheticMechanicalState", "realWorldState", "remainingEvidenceCount",
      "remainingEvidence",
    ], `دروازهٔ ${index + 1}`);
    const [expectedId, expectedStage] = gateDefinitions[index];
    if (gate.gateId !== expectedId || gate.stage !== expectedStage) {
      throw new Error("ترتیب یا مرحلهٔ دروازه‌ها تغییر کرده است");
    }
    nonEmptyText(gate.ownerTitleFa, "عنوان دروازه");
    nonEmptyText(gate.ownerStateFa, "وضعیت فارسی دروازه");
    nonEmptyText(gate.ownerExplanationFa, "توضیح دروازه");
    if (!(["passed", "failed", "blocked"] as unknown[]).includes(gate.syntheticMechanicalState)
      || gate.realWorldState !== "not_evaluated") {
      throw new Error("وضعیت ساختگی و واقعی نباید با هم ادغام شوند");
    }
    if (!Number.isSafeInteger(gate.remainingEvidenceCount)
      || (gate.remainingEvidenceCount as number) < 1
      || !Array.isArray(gate.remainingEvidence)
      || gate.remainingEvidence.length !== gate.remainingEvidenceCount) {
      throw new Error("تعداد شواهد با فهرست آن یکسان نیست");
    }
    gate.remainingEvidence.forEach((value) => {
      const evidence = exactRecord(value, ["evidenceId", "ownerLabelFa", "state"], "شاهد باقی‌مانده");
      const evidenceId = validateIdentity(evidence.evidenceId, /^[A-Z0-9_]+$/, "شناسهٔ شاهد");
      if (seenEvidence.has(evidenceId) || evidence.state !== "required_not_supplied") {
        throw new Error("شاهد تکراری یا به‌اشتباه آماده اعلام شده است");
      }
      seenEvidence.add(evidenceId);
      nonEmptyText(evidence.ownerLabelFa, "عنوان فارسی شاهد");
      evidenceCount += 1;
    });
  });
  if (evidenceCount !== 64) throw new Error("فهرست شواهد مرجع باید دقیقاً ۶۴ مورد باشد");

  const summary = exactRecord(report.summary, [
    "ownerHeadlineFa", "ownerNextBoundaryFa", "syntheticGateMechanicsState",
    "syntheticPreflightMechanicalState", "realCalibrationState", "realReadinessState",
    "performanceClaimState", "promotionState",
  ], "خلاصهٔ گزارش");
  nonEmptyText(summary.ownerHeadlineFa, "عنوان گزارش");
  if (summary.ownerNextBoundaryFa !== "گام واقعی فقط پس از مجوز داده، شواهد ایران و تأیید جداگانهٔ مالک باز می‌شود."
    || !(["passed", "failed", "blocked"] as unknown[]).includes(summary.syntheticGateMechanicsState)
    || !(["passed", "failed", "blocked"] as unknown[]).includes(summary.syntheticPreflightMechanicalState)
    || summary.realCalibrationState !== "not_evaluated"
    || summary.realReadinessState !== "blocked_until_licensed_iran_evidence"
    || summary.performanceClaimState !== "not_evaluated"
    || summary.promotionState !== "blocked_in_synthetic_readiness_report") {
    throw new Error("خلاصهٔ گزارش، آمادگی واقعی را باز کرده است");
  }

  const boundary = exactRecord(report.boundary, [
    "containsMarketObservations", "containsProviderSelection", "containsProviderCredentials",
    "realDataRequestCreated", "methodScoreProduced", "methodRankingProduced",
    "performanceClaimAllowed", "thresholdSelectionAllowed",
  ], "مرز ایمنی گزارش");
  if (Object.values(boundary).some((item) => item !== false)
    || report.financialUseAllowed !== false
    || report.executionAllowed !== false
    || report.parameterMutationAllowed !== false) {
    throw new Error("یکی از قفل‌های مالی گزارش باز شده است");
  }
  return report as unknown as CalibrationReadinessReport;
}

type ReferenceResponse = Pick<Response, "ok" | "json">;
type ReferenceFetcher = (path: string, init: RequestInit) => Promise<ReferenceResponse>;

export async function loadCalibrationReadinessReference(
  fetcher: ReferenceFetcher = globalThis.fetch,
) {
  const response = await fetcher(CALIBRATION_READINESS_REFERENCE_PATH, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("گزارش مرجع محلی در دسترس نیست");
  return validateCalibrationReadinessReport(await response.json());
}
