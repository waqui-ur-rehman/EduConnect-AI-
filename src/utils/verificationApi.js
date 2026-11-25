import { apiBase, apiFetch } from "./api";
export const verificationApiBase = apiBase;

export async function verificationRequest(path, options = {}) {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Verification request failed. Please try again.");
  }
  return response;
}
