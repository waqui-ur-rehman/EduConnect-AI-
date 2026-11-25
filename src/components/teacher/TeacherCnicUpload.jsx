import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, IdCard, Info, LoaderCircle, ShieldCheck, Upload, X } from "lucide-react";
import { verificationRequest } from "../../utils/verificationApi";
import "./TeacherCnicUpload.css";

const supported = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 2 * 1024 * 1024;

function DocumentUpload({ side, file, disabled, onChange }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const previewRef = useRef(null);
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    previewRef.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <fieldset className="edc-cnic-document" disabled={disabled}>
      <legend>CNIC {side}</legend>
      <p className="edc-cnic-side-hint">{side === "front" ? "Side with your photo and personal details" : "Reverse side of your identity card"}</p>
      <label className={`edc-cnic-upload${file ? " has-file" : ""}`} htmlFor={inputId}>
        <input ref={inputRef} id={inputId} type="file" accept="image/jpeg,image/png,image/webp" required aria-label={`Choose CNIC ${side} image`} onChange={event => onChange(event.target.files?.[0] || null, event.target)} />
        {file ? <>
          <img ref={previewRef} className="edc-cnic-preview" alt={`Selected CNIC ${side}`} />
          <span className="edc-cnic-replace"><Upload size={15} aria-hidden="true" />Change image</span>
        </> : <>
          <span className="edc-cnic-upload-icon"><IdCard size={35} strokeWidth={1.4} aria-hidden="true" /></span>
          <strong>Upload {side} image</strong>
          <span className="edc-cnic-upload-hint">Choose a clear, uncropped photo</span>
          <span className="edc-cnic-browse"><Upload size={15} aria-hidden="true" />Choose image</span>
        </>}
      </label>
      {file && <div className="edc-cnic-file">
        <CheckCircle2 size={17} aria-hidden="true" />
        <span><strong title={file.name}>{file.name}</strong><small>{(file.size / (1024 * 1024)).toFixed(2)} MB</small></span>
        <button type="button" aria-label={`Remove CNIC ${side} image`} onClick={() => {
          onChange(null);
          inputRef.current.value = "";
          inputRef.current.focus();
        }}><X size={16} aria-hidden="true" /></button>
      </div>}
    </fieldset>
  );
}

export default function TeacherCnicUpload({ cnicStatus, rejectionReason = "", onSubmitted, role = "teacher" }) {
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const blocked = cnicStatus === "pending" || cnicStatus === "verified";

  function selectImage(setFile, file, input) {
    setError("");
    setMessage("");
    if (file && (!supported.has(file.type) || file.size > maxBytes || file.size === 0)) {
      setError("Use JPG, PNG or WebP images, maximum 2 MB each.");
      setFile(null);
      input.value = "";
      return;
    }
    setFile(file);
  }

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setError("");
    if (blocked || busy) return;
    if (!front || !back || !consent) {
      setError("Select both images and confirm your consent.");
      return;
    }
    if ([front, back].some(file => !supported.has(file.type) || file.size > maxBytes || file.size === 0)) {
      setError("Use JPG, PNG or WebP images, maximum 2 MB each.");
      return;
    }
    const body = new FormData();
    body.append("cnicFront", front);
    body.append("cnicBack", back);
    try {
      setBusy(true);
      const response = await verificationRequest(`/${role === "student" ? "student" : "teacher"}/verification/submit`, { method: "POST", body });
      const payload = await response.json();
      if (!payload.success) throw new Error(payload.message || "Submission failed.");
      setFront(null);
      setBack(null);
      setConsent(false);
      form.reset();
      setMessage("Verification request received. An Admin will review it.");
      onSubmitted?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit verification.");
    } finally { setBusy(false); }
  }

  if (blocked) {
    const verified = cnicStatus === "verified";
    const StatusIcon = verified ? ShieldCheck : Clock3;
    return <div className={`edc-cnic-status${verified ? " is-verified" : ""}`} role="status">
      <StatusIcon size={23} aria-hidden="true" />
      <div><strong>{verified ? "Identity verified" : "Documents under review"}</strong><p>{verified ? "Your CNIC has been approved. Your profile now displays a Verified badge." : "Your identity verification request is under Admin review."}</p></div>
    </div>;
  }

  return <form id="edc-cnic-upload" className="edc-cnic-form" onSubmit={submit} aria-label="Submit identity verification" aria-busy={busy}>
    <div className="edc-cnic-heading">
      <span className="edc-cnic-heading-icon"><ShieldCheck size={24} aria-hidden="true" /></span>
      <div><h3>Submit Identity Verification</h3><p>Upload a clear image of each side of your CNIC.</p></div>
    </div>
    {cnicStatus === "rejected" && <p className="edc-cnic-feedback is-error" role="alert">Your previous submission was rejected. {rejectionReason} Upload corrected images to submit again.</p>}
    <p className="edc-cnic-formats">JPG, PNG or WebP <span aria-hidden="true">·</span> Up to 2 MB per image</p>
    <div className="edc-cnic-documents">
      <DocumentUpload side="front" file={front} disabled={busy} onChange={(file, input) => selectImage(setFront, file, input)} />
      <DocumentUpload side="back" file={back} disabled={busy} onChange={(file, input) => selectImage(setBack, file, input)} />
    </div>
    <div className="edc-cnic-notice"><Info size={18} aria-hidden="true" /><p>Your documents are stored securely and reviewed by authorized Admins to verify your identity.</p></div>
    <label className="edc-cnic-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>I consent to submitting these documents for identity verification.</span></label>
    {error && <p className="edc-cnic-feedback is-error" role="alert">{error}</p>}
    {message && <p className="edc-cnic-feedback is-success" role="status">{message}</p>}
    <div className="edc-cnic-footer">
      <span><ShieldCheck size={16} aria-hidden="true" />Reviewed by authorized Admins</span>
      <button className="edc-cnic-button" type="submit" disabled={busy || !consent || !front || !back}>
        {busy ? <><LoaderCircle className="edc-cnic-spinner" size={17} aria-hidden="true" />Submitting…</> : <>Submit for Verification<ArrowRight size={17} aria-hidden="true" /></>}
      </button>
    </div>
  </form>;
}

