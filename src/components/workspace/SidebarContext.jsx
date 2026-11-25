import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SidebarContext } from "./SidebarContextStore";

const MOBILE_QUERY = "(max-width: 767px)";

function readInitialOpen(storageKey, defaultOpen) {
  try {
    const collapsed = window.localStorage.getItem(storageKey);
    return collapsed === null ? defaultOpen : collapsed !== "true";
  } catch (error) {
    console.error("Could not read the sidebar preference", error);
    return defaultOpen;
  }
}

export function WorkspaceSidebarProvider({
  storageKey,
  defaultOpen = true,
  children,
}) {
  const [openState, setOpenState] = useState(() =>
    readInitialOpen(storageKey, defaultOpen)
  );
  const openRef = useRef(openState);
  const [openMobile, setOpenMobile] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches
  );
  const defaultOpenRef = useRef(defaultOpen);

  const setOpen = useCallback((value) => {
    const nextOpen =
      typeof value === "function" ? value(openRef.current) : value;
    openRef.current = nextOpen;
    setOpenState(nextOpen);
    try {
      window.localStorage.setItem(storageKey, String(!nextOpen));
    } catch (error) {
      console.error("Could not save the sidebar preference", error);
    }
  }, [storageKey]);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
    } else {
      setOpen((current) => !current);
    }
  }, [isMobile, setOpen]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const updateViewport = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) setOpenMobile(false);
    };
    updateViewport(media);
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (defaultOpenRef.current !== defaultOpen) {
      defaultOpenRef.current = defaultOpen;
      setOpen(defaultOpen);
    }
  }, [defaultOpen, setOpen]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "b") {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      toggleSidebar();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const value = useMemo(() => ({
    open: openState,
    setOpen,
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  }), [openState, setOpen, openMobile, isMobile, toggleSidebar]);
  const sidebarWidth = isMobile
    ? "0px"
    : openState
      ? "var(--edc-sidebar-width)"
      : "var(--edc-sidebar-width-icon)";

  return (
    <SidebarContext.Provider value={value}>
      <div
        className="edc-workspace-sidebar-state"
        style={{ "--edc-sidebar-current-width": sidebarWidth }}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
