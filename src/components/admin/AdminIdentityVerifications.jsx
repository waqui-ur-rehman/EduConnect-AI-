import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { verificationRequest } from "../../utils/verificationApi";
import "./AdminIdentityVerifications.css";

const verificationPath = role => role === "student" ? "/admin/student-verifications" : "/admin/verifications";

export default function AdminIdentityVerifications() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState({ loading: false, images: [], error: "" });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const results = await Promise.allSettled(["teacher", "student"].map(async accountRole => {
          const response = await verificationRequest(verificationPath(accountRole), { signal: controller.signal });
          const data = await response.json();
          return data.verifications.map(record => ({ ...record, role: accountRole }));
        }));
        if (controller.signal.aborted) return;
        const groups = results.filter(result => result.status === "fulfilled").map(result => result.value);
        const failures = results.filter(result => result.status === "rejected");
        setRecords(groups.flat().sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt)));
        setError(failures.length
          ? failures.map(result => result.reason?.message || "A verification queue could not be loaded.").join(" ")
          : "");
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError.message || "Could not load verification requests.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    const images = [];
    async function loadImages() {
      try {
        for (const side of ["front", "back"]) {
          const response = await verificationRequest(`${verificationPath(selected.role)}/${selected.id}/document/${side}`, { signal: controller.signal });
          const blob = await response.blob();
          if (controller.signal.aborted) return;
          images.push({ side, url: URL.createObjectURL(blob) });
        }
        setPreview({ loading: false, images, error: "" });
      } catch (loadError) {
        if (!controller.signal.aborted) setPreview({ loading: false, images: [], error: loadError.message || "Could not load documents." });
      }
    }
    void loadImages();
    return () => {
      controller.abort();
      images.forEach(image => URL.revokeObjectURL(image.url));
    };
  }, [selected]);

  const visible = useMemo(() => records.filter(record =>
    (role === "all" || role === record.role) &&
    `${record.fullName} ${record.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  ), [records, role, search]);

  function openReview(record) {
    setSelected(record);
    setPreview({ loading: true, images: [], error: "" });
    setReason("");
    setError("");
    setMessage("");
  }

  async function review(decision) {
    if (saving || !selected || preview.loading || preview.error || preview.images.length !== 2) return;
    if (decision === "reject" && reason.trim().length < 5) {
      setError("Enter a reason of at least 5 characters so the user can correct their submission.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await verificationRequest(`${verificationPath(selected.role)}/${selected.id}/${decision}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await response.json();
      setMessage(data.message);
      setSelected(null);
      setLoading(true);
      setRevision(value => value + 1);
    } catch (reviewError) {
      setError(reviewError.message || "Could not save the review.");
    } finally { setSaving(false); }
  }

  return (
    <div className="edc-id-review">
      <div className="edc-id-review-heading">
        <div><h1><ShieldCheck size={25} />Identity Verification</h1><p>Review CNIC submissions from teachers and students.</p></div>
        <button type="button" disabled={loading || saving} onClick={() => { setLoading(true); setRevision(value => value + 1); }}><RefreshCw size={16} />Refresh</button>
      </div>
      {error && <p className="edc-id-review-error" role="alert">{error}</p>}
      {message && <p className="edc-id-review-success" role="status">{message}</p>}
      <div className="edc-id-review-toolbar">
        <label><Search size={17} /><input aria-label="Search verification requests" placeholder="Search by name or email" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <select aria-label="Filter by account role" value={role} onChange={event => setRole(event.target.value)}><option value="all">All accounts</option><option value="teacher">Teachers</option><option value="student">Students</option></select>
      </div>
      <div className="edc-id-review-table">
        <table>
          <thead><tr><th>Account</th><th>Role</th><th>Submitted</th><th>Action</th></tr></thead>
          <tbody>{!loading && visible.map(record => <tr key={`${record.role}:${record.id}`}>
            <td><strong>{record.fullName}</strong><small>{record.email}</small></td><td className="edc-id-review-role">{record.role}</td>
            <td>{new Date(record.submittedAt).toLocaleString()}</td><td><button type="button" disabled={saving} onClick={() => openReview(record)}>Review documents</button></td>
          </tr>)}</tbody>
        </table>
        {loading ? <p role="status">Loading verification requests…</p> : !visible.length && <p>No pending verification requests.</p>}
      </div>
      {selected && <section className="edc-id-review-detail" aria-label={`Review CNIC for ${selected.fullName}`} aria-busy={saving}>
        <div className="edc-id-review-heading"><div><h2>{selected.fullName}</h2><p>{selected.email} · {selected.role}</p></div><button type="button" aria-label="Close document review" disabled={saving} onClick={() => setSelected(null)}><X size={18} /></button></div>
        {preview.loading && <p role="status">Loading CNIC images…</p>}
        {preview.error && <p className="edc-id-review-error" role="alert">{preview.error}</p>}
        <div className="edc-id-review-images">{preview.images.map(image => <figure key={image.side}><figcaption>CNIC {image.side}</figcaption><a href={image.url} target="_blank" rel="noreferrer" aria-label={`Open CNIC ${image.side} at full size`}><img src={image.url} alt={`CNIC ${image.side} for review`} /></a></figure>)}</div>
        <label className="edc-id-review-reason">Review reason <span>(required when rejecting)</span><textarea rows={3} maxLength={500} disabled={saving} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain what needs to be corrected…" /></label>
        <div className="edc-id-review-actions">
          <button type="button" className="reject" disabled={saving || preview.loading || !!preview.error || preview.images.length !== 2} onClick={() => review("reject")}>Reject submission</button>
          <button type="button" className="approve" disabled={saving || preview.loading || !!preview.error || preview.images.length !== 2} onClick={() => review("approve")}><CheckCircle2 size={17} />{saving ? "Saving…" : "Approve CNIC"}</button>
        </div>
      </section>}
    </div>
  );
}
