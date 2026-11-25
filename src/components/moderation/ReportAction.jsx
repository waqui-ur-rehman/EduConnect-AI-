import { useState } from "react";
import { Flag, X } from "lucide-react";
import { MODERATION_REASONS, submitModerationReport } from "../../utils/moderationReports";
import "./ReportAction.css";

export default function ReportAction({ target, reporterEmail, reporterName, reporterRole = "Student", label = "Report" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event) {
    event.preventDefault();
    try {
      await submitModerationReport({ ...target, reason, description, evidence, reporterEmail, reporterName, reporterRole });
      setDone(true);
      setFeedback("Report submitted. Admin will review the allegation and evidence.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Report could not be saved.");
    }
  }

  return <>
    <button className="edc-report-trigger" type="button" onClick={() => { setFeedback(""); setOpen(true); }}><Flag size={14} /> {label}</button>
    {open && <div className="edc-report-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <form className="edc-report-dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="edc-report-title">
        <button className="edc-report-close" type="button" onClick={() => setOpen(false)} aria-label="Close report form"><X size={18} /></button>
        <span className="edc-report-kicker">PRIVATE REPORT</span>
        <h2 id="edc-report-title">Report {target.targetTitle}</h2>
        <p>Reports are allegations until an Admin reviews the details.</p>
        <label>Reason<select required value={reason} onChange={(event) => setReason(event.target.value)}><option value="">Choose a reason</option>{MODERATION_REASONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Description<textarea required minLength={10} maxLength={1500} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what happened and where it appears." /></label>
        <label>Evidence (optional)<input maxLength={500} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Evidence link or short reference" /></label>
        {feedback && <p className={done ? "edc-report-success" : "edc-report-error"} role={done ? "status" : "alert"}>{feedback}</p>}
        <div><button type="button" className="edc-report-cancel" onClick={() => setOpen(false)}>Close</button><button type="submit" disabled={done}>Submit Report</button></div>
      </form>
    </div>}
  </>;
}
