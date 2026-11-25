import { useEffect, useState } from "react";
import { verificationRequest } from "../../utils/verificationApi";
import VerifiedBadge from "./VerifiedBadge";

export default function StudentProfileBadge({ email }) {
  const [profile, setProfile] = useState(null);
  const normalizedEmail = String(email || "").trim().toLowerCase();

  useEffect(() => {
    if (!normalizedEmail) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await verificationRequest(`/auth/profiles/student/${encodeURIComponent(normalizedEmail)}/verification`, { signal: controller.signal });
        const data = await response.json();
        if (!controller.signal.aborted) setProfile({ email: normalizedEmail, verified: data.profile?.isIdentityVerified === true });
      } catch {
        if (!controller.signal.aborted) setProfile(null);
      }
    }
    void load();
    return () => controller.abort();
  }, [normalizedEmail]);

  return profile?.email === normalizedEmail && profile.verified ? <VerifiedBadge label="Verified Profile" /> : null;
}
