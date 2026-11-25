import { useEffect, useState } from "react";
import TeacherCnicUpload from "../teacher/TeacherCnicUpload";
import { apiFetch } from "../../utils/api";

export default function IdentityVerificationPanel({ role = "student" }) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ status: "loading", error: "" });
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/${role}/verification`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json.success) throw new Error(json.message || `Verification API returned ${response.status}`);
        return json;
      })
      .then((json) => {
        if (!controller.signal.aborted) { setState({ status: json.verification?.cnicStatus || json.verification?.status || "not_submitted", error: "" }); window.dispatchEvent(new Event("edc-verification-updated")); }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setState({ status: "error", error: e.message || "Cannot load verification status" });
      });
    return () => controller.abort();
  }, [role, revision]);
  const display = state.status === "verified" ? "Verified" : state.status === "pending" ? "Under review" : state.status === "rejected" ? "Rejected" : state.status === "loading" ? "Checking…" : state.status === "error" ? "Unavailable" : "Not submitted";
  return (
    <section id="edc-identity-verification" style={{ background: "#fcfaff", border: "1px solid #ddd6fe", borderRadius: 14, padding: 18, marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, color: "#4c1d95" }}>Verification</h3>
        <strong style={{ color: state.status === "verified" ? "#15803d" : "#92400e" }}>{display}</strong>
      </div>
      <p style={{ color: "#625477" }}>Verification is optional. Learning and teaching tools do not require CNIC approval. A Verified badge appears after authorized Admin review.</p>
      {state.status === "error" && (
        <><p role="alert" style={{ color: "#b91c1c" }}>{state.error}</p>
        <button type="button" onClick={() => setRevision((n) => n + 1)} style={{ background: "#EEC651", border: 0, padding: "8px 14px", borderRadius: 8 }}>Retry</button></>
      )}
      {!["error", "loading"].includes(state.status) && (
        <TeacherCnicUpload role={role} cnicStatus={state.status} onSubmitted={() => setRevision((n) => n + 1)} />
      )}
    </section>
  );
}

export function VerifiedIdentityBadge({ role = "student" }) {
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const res = await apiFetch(`/${role}/verification`, { signal: controller.signal });
        const json = await res.json();
        if (!controller.signal.aborted) setVerified(res.ok && json.success && (json.verification?.cnicStatus === "verified" || json.verification?.status === "verified"));
      } catch { if (!controller.signal.aborted) setVerified(false); }
    };
    refresh();
    window.addEventListener("edc-verification-updated", refresh);
    return () => { controller.abort(); window.removeEventListener("edc-verification-updated", refresh); };
  }, [role]);
  return verified ? <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "4px 9px", marginLeft: 8, background: "#dcfce7", color: "#166534" }}>✓ Verified</span> : null;
}
