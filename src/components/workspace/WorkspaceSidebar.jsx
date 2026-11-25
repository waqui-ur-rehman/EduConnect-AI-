import { Fragment, useContext } from "react";
import { Link } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import WorkspaceBrand from "../WorkspaceBrand";
import { SidebarContext } from "./SidebarContextStore";
import "./WorkspaceSidebar.css";

function useWorkspaceSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("Workspace sidebar components must be used within a WorkspaceSidebarProvider");
  }
  return context;
}

function groupItems(menuConfig) {
  return menuConfig.reduce((groups, item) => {
    const groupId = item.sectionKey ?? item.sectionLabel ?? "";
    const lastGroup = groups.at(-1);
    if (lastGroup && lastGroup.groupId === groupId) {
      lastGroup.items.push(item);
    } else {
      groups.push({
        key: `${groupId}-${groups.length}`,
        groupId,
        label: item.sectionLabel || "",
        items: [item],
      });
    }
    return groups;
  }, []);
}

export function SidebarTrigger({ label = "workspace" }) {
  const { open, openMobile, isMobile, toggleSidebar } = useWorkspaceSidebar();
  const expanded = isMobile ? openMobile : open;
  const action = isMobile
    ? (expanded ? "Close" : "Open")
    : (expanded ? "Collapse" : "Expand");

  return (
    <button
      type="button"
      className="edc-workspace-sidebar-trigger"
      aria-label={`${action} ${label} sidebar`}
      aria-controls="edc-workspace-sidebar"
      aria-expanded={expanded}
      title={`${action} sidebar (Ctrl/Cmd+B)`}
      onClick={toggleSidebar}
    >
      <PanelLeft size={20} aria-hidden="true" />
    </button>
  );
}

function WorkspaceSidebar({
  menuConfig,
  profile,
  footer,
  ariaLabel = "Workspace navigation",
  onNavigate,
}) {
  const { open, openMobile, setOpenMobile, isMobile } = useWorkspaceSidebar();
  const collapsed = !isMobile && !open;
  const groups = groupItems(menuConfig);
  const closeMobile = () => setOpenMobile(false);

  return (
    <>
      {isMobile && openMobile && (
        <button
          type="button"
          className="edc-workspace-sidebar-overlay"
          aria-label="Close navigation"
          onClick={closeMobile}
        />
      )}
      <aside
        id="edc-workspace-sidebar"
        className={`edc-workspace-sidebar${collapsed ? " is-collapsed" : ""}${isMobile ? (openMobile ? " is-mobile-open" : " is-mobile-closed") : ""}`}
        aria-label={ariaLabel}
        aria-hidden={isMobile && !openMobile}
      >
        <header className="edc-workspace-sidebar-header">
          <WorkspaceBrand />
        </header>

        <div className="edc-workspace-sidebar-profile">
          <span className="edc-workspace-sidebar-avatar">
            {profile.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              String(profile.name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
            )}
          </span>
          <span className="edc-workspace-sidebar-profile-copy">
            <strong title={profile.name}>{profile.name}</strong>
            <small title={profile.subline}>{profile.subline}</small>
          </span>
        </div>

        <nav className="edc-workspace-sidebar-menu" aria-label={ariaLabel}>
          {groups.map((group) => (
            <div className="edc-workspace-sidebar-group" key={group.key}>
              {group.label && (
                <span className="edc-workspace-sidebar-group-label">
                  {group.label}
                </span>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const itemClassName = `edc-workspace-sidebar-item${item.active ? " is-active" : ""}`;
                const itemContent = (
                  <>
                    <Icon size={18} aria-hidden="true" />
                    <span className="edc-workspace-sidebar-item-label">{item.label}</span>
                    {item.badge !== undefined && item.badge !== null && item.badge !== "" && (
                      <span className="edc-workspace-sidebar-badge">{item.badge}</span>
                    )}
                  </>
                );

                return (
                  <Fragment key={item.id ?? item.route}>
                    {onNavigate ? (
                      <button
                        type="button"
                        className={itemClassName}
                        aria-current={item.ariaCurrent}
                        aria-label={item.label}
                        title={collapsed ? item.label : undefined}
                        onClick={() => {
                          onNavigate(item.route);
                          closeMobile();
                        }}
                      >
                        {itemContent}
                      </button>
                    ) : (
                      <Link
                        to={item.route}
                        className={itemClassName}
                        aria-current={item.ariaCurrent}
                        aria-label={item.label}
                        title={collapsed ? item.label : undefined}
                        onClick={closeMobile}
                      >
                        {itemContent}
                      </Link>
                    )}
                  </Fragment>
                );
              })}
            </div>
          ))}
        </nav>

        {footer && (
          <div className="edc-workspace-sidebar-footer">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}

export default WorkspaceSidebar;
