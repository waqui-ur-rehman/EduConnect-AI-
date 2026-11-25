import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { refreshContent } from "./contentApi";

export default function useContentSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    const refresh = () => refreshContent().catch((error) => console.error("Content refresh failed", error));
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 15000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => { refreshContent().catch(console.error); }, [pathname]);
}
