import { BadgeCheck } from "lucide-react";
import "./verification.css";

export default function VerifiedBadge({ label = "Verified" }) {
  return <span className="edc-identity-verified"><BadgeCheck size={15} aria-hidden="true" />{label}</span>;
}
