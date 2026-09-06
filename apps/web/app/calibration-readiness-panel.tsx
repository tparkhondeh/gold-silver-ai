"use client";

import { useEffect, useState } from "react";
import {
  loadCalibrationReadinessReference,
  type CalibrationReadinessReport,
} from "./calibration-readiness-report";

type PanelState =
  | { state: "checking" }
  | { state: "ready"; report: CalibrationReadinessReport }
  | { state: "blocked" };

const stageLabels = {
  data: "داده",
  fit: "تنظیم روش",
  test: "آزمون مستقل",
  promotion: "مجوز استفاده",
};

export function CalibrationReadinessPanel() {
  const [panel, setPanel] = useState<PanelState>({ state: "checking" });

  useEffect(() => {
    let active = true;
    loadCalibrationReadinessReference().then(
      (report) => active && setPanel({ state: "ready", report }),
      () => active && setPanel({ state: "blocked" }),
    );
    return () => { active = false; };
  }, []);

  if (panel.state === "checking") {
    return <section className="panel calibration-readiness-panel" aria-live="polite">
      <strong>در حال بررسی گزارش مرجع آزمایشگاه…</strong>
      <p>تا پایان بررسی هویت و قفل‌ها، هیچ وضعیت آمادگی نمایش داده نمی‌شود.</p>
    </section>;
  }

  if (panel.state === "blocked") {
    return <section className="panel calibration-readiness-panel calibration-readiness-blocked" role="alert">
      <strong>نمایش گزارش متوقف شد</strong>
      <p>فایل مرجع ناقص یا تغییرکرده است. این وضعیت به معنی آمادگی مالی نیست و هیچ مجوزی باز نشده است.</p>
    </section>;
  }

  const { report } = panel;
  const totalEvidence = report.gateReadiness.reduce(
    (total, gate) => total + gate.remainingEvidenceCount,
    0,
  );
  return <section className="panel calibration-readiness-panel" aria-labelledby="calibration-readiness-title">
    <div className="calibration-readiness-head">
      <div>
        <span>گزارش مرجع · فقط آزمایشگاه ساختگی</span>
        <h2 id="calibration-readiness-title">آمادگی کالیبراسیون روش تصمیم‌سازی</h2>
        <p>{report.summary.ownerHeadlineFa}</p>
      </div>
      <div className="calibration-readiness-summary" aria-label="خلاصهٔ وضعیت کالیبراسیون">
        <strong>واقعی: شروع نشده</strong>
        <small>{totalEvidence.toLocaleString("fa-IR")} مدرک واقعی هنوز لازم است</small>
      </div>
    </div>
    <div className="calibration-readiness-warning">
      <b>این فهرست درصد پیشرفت یا تأیید عملکرد نیست.</b>
      <p>{report.summary.ownerNextBoundaryFa}</p>
    </div>
    <div className="calibration-gate-list">
      {report.gateReadiness.map((gate, index) => <details className="calibration-gate" key={gate.gateId}>
        <summary>
          <span className="calibration-gate-number">{(index + 1).toLocaleString("fa-IR")}</span>
          <span><b>{gate.ownerTitleFa}</b><small>{stageLabels[gate.stage]}</small></span>
          <strong>در انتظار شواهد واقعی</strong>
        </summary>
        <div className="calibration-gate-body">
          <p>{gate.ownerExplanationFa}</p>
          <div className="calibration-gate-states">
            <span><small>تمرین نرم‌افزاری</small><b>{gate.ownerStateFa}</b></span>
            <span><small>بازار واقعی ایران</small><b>ارزیابی نشده</b></span>
          </div>
          <div className="calibration-evidence-list">
            <strong>{gate.remainingEvidenceCount.toLocaleString("fa-IR")} مدرک باقی‌مانده</strong>
            <ul>{gate.remainingEvidence.map((evidence) => <li key={evidence.evidenceId}>{evidence.ownerLabelFa}</li>)}</ul>
          </div>
        </div>
      </details>)}
    </div>
    <small className="calibration-reference-id">شناسهٔ نسخه: {report.reportId}</small>
  </section>;
}
