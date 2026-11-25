import { useLocation } from "react-router-dom";
import {
  ADMIN_NAV_GROUPS,
  getAdminSectionByPath,
} from "./adminNavigation";
import { ADMIN_USERS_KEY, readAdminArray } from "./adminData";
import WorkspaceSidebar from "../workspace/WorkspaceSidebar";

function AdminSidebar({ email, platformSettings }) {
  const location = useLocation();
  const currentSection = getAdminSectionByPath(location.pathname);
  const highlightedItemId = currentSection?.parentId ?? currentSection?.id;
  const account = readAdminArray(ADMIN_USERS_KEY).find((user) => user.role === "Admin" && String(user.email).toLowerCase() === String(email || "").toLowerCase());
  const displayName = account?.name?.trim() || "Admin";
  const websiteName = platformSettings?.general?.websiteName || "EduConnect AI";
  const menuConfig = ADMIN_NAV_GROUPS.flatMap(({ id: sectionKey, label: sectionLabel, items }) =>
    items.map(({ id, path, title, navTitle, icon: Icon }) => {
      const isCurrentPage = id === currentSection?.id;
      const isHighlighted = id === highlightedItemId;
      return {
        id,
        route: path,
        label: navTitle ?? title,
        icon: Icon,
        sectionKey,
        sectionLabel,
        active: isHighlighted,
        ariaCurrent: isCurrentPage ? "page" : isHighlighted ? "true" : undefined,
      };
    })
  );

  return (
    <WorkspaceSidebar
      menuConfig={menuConfig}
      profile={{ avatar: account?.avatar || account?.profile?.avatar || "", name: displayName, subline: email || "Admin account" }}
      ariaLabel="Admin sections"
      footer={
        <div className="edc-workspace-sidebar-footer-card edc-admin-sidebar-status">
          <strong>{websiteName}</strong>
          <p>Admin workspace</p>
          <span><i className="edc-admin-status-dot" aria-hidden="true" /> Admin session active</span>
        </div>
      }
    />
  );
}

export default AdminSidebar;
