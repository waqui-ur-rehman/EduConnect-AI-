import { useRef, useState } from "react";
import {
  Check,
  CreditCard,
  Database,
  Download,
  Info,
  Layers3,
  Mail,
  Palette,
  Puzzle,
  RotateCcw,
  Save,
  Settings2,
  Upload,
} from "lucide-react";
import { appendAdminActivityRecord } from "./adminData";
import {
  ADMIN_DENSITY_OPTIONS,
  DEFAULT_ADMIN_PREFERENCES,
  saveAdminPreferences,
  resetAdminPreferences,
} from "./adminSettings";
import {
  DEFAULT_ADMIN_PLATFORM_SETTINGS,
  validateAdminPlatformSettings,
  getAdminPlatformSettings,
  saveAdminPlatformSettings,
  resetAdminPlatformSettings,
} from "./adminPlatformSettings";

const SETTINGS_TABS = [
  { id: "general", label: "General Settings", icon: Settings2 },
  { id: "platform", label: "Platform Settings", icon: Layers3 },
  { id: "notifications", label: "Email & Notifications", icon: Mail },
  { id: "payments", label: "Payment Settings", icon: CreditCard },
  { id: "integrations", label: "Integrations", icon: Puzzle },
  { id: "appearance", label: "Appearance & Theme", icon: Palette },
  { id: "backup", label: "Backup & Maintenance", icon: Database },
];

function AdminSettings({ preferences, platformSettings }) {
  const [activeTab, setActiveTab] = useState("general");
  const [density, setDensity] = useState(preferences.density);
  const [draft, setDraft] = useState(() => {
    const current = platformSettings || getAdminPlatformSettings();
    return {
      general: current.general,
      appearance: current.appearance,
      rules: current.rules,
      marketplace: current.marketplace,
      system: current.system,
      notifications: current.notifications,
    };
  });
  const [feedback, setFeedback] = useState(null);
  const importInputRef = useRef(null);

  function update(group, key, value) {
    setFeedback(null);
    setDraft((current) => ({
      ...current,
      [group]: { ...current[group], [key]: value },
    }));
  }

  function recordSettingsChange(action, description, previousValue, newValue, options = {}) {
    try {
      const actor = window.sessionStorage.getItem("educonnect.demoEmail") || "Admin";
      appendAdminActivityRecord({
        actor,
        actorRole: "Admin",
        action,
        category: options.category || "admin-settings",
        module: options.module || "Settings & Configuration",
        entityType: options.entityType || "Admin Settings",
        entityId: options.entityId || "platform-settings",
        targetId: options.entityId || "platform-settings",
        targetName: options.targetName || "Admin platform configuration",
        previousValue,
        newValue,
        description,
        result: "Success",
      });
    } catch {
      // A local audit storage error must not roll back saved settings.
    }
  }

  function handleSave(event) {
    event.preventDefault();
    try {
      const changedFields = [];
      ["general", "appearance", "rules", "marketplace", "system", "notifications"].forEach((group) => {
        Object.keys(draft[group] || {}).forEach((key) => {
          if (JSON.stringify(draft[group][key]) !== JSON.stringify(platformSettings?.[group]?.[key])) {
            changedFields.push(`${group}.${key}`);
          }
        });
      });
      if (density !== preferences.density) changedFields.push("appearance.contentSpacing");
      saveAdminPlatformSettings(draft);
      saveAdminPreferences({ density });
      recordSettingsChange(
        "Admin Settings Updated",
        "Admin saved browser-local platform settings. Contact details and configuration values are not copied into the activity record.",
        changedFields.length ? `Changed fields: ${changedFields.join(", ")}` : "Current saved configuration",
        "Updated configuration",
      );
      const changedRuleFields = changedFields.filter((field) => field.startsWith("rules."));
      if (changedRuleFields.length) {
        recordSettingsChange(
          "Security Policy Updated",
          "Admin updated review or publishing policy settings. Policy values are not copied into the security activity record.",
          `Changed policy fields: ${changedRuleFields.join(", ")}`,
          "Updated policy",
          { category: "security", module: "Security & Access", entityType: "Security Policy", entityId: "platform-rules", targetName: "Platform review and publishing policy" },
        );
      }
      setFeedback({ type: "success", message: "Settings saved in this browser." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Settings could not be saved." });
    }
  }

  function handleReset() {
    if (!window.confirm("Reset all Admin settings to their defaults?")) return;
    try {
      resetAdminPlatformSettings();
      resetAdminPreferences();
      recordSettingsChange(
        "Admin Settings Reset",
        "Admin reset browser-local platform and interface settings to their defaults. Sensitive setting values are not copied into the activity record.",
        "Current saved settings",
        "Default settings",
      );
      if (JSON.stringify(platformSettings?.rules) !== JSON.stringify(DEFAULT_ADMIN_PLATFORM_SETTINGS.rules)) {
        recordSettingsChange(
          "Security Policy Reset",
          "Admin reset review and publishing policies to their defaults. Policy values are not copied into the security activity record.",
          "Current saved policy",
          "Default policy",
          { category: "security", module: "Security & Access", entityType: "Security Policy", entityId: "platform-rules", targetName: "Platform review and publishing policy" },
        );
      }
      setDensity(DEFAULT_ADMIN_PREFERENCES.density);
      setDraft({ ...DEFAULT_ADMIN_PLATFORM_SETTINGS });
      setFeedback({ type: "success", message: "All Admin settings were reset to their defaults." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Settings could not be reset." });
    }
  }

  function handleExport() {
    try {
      const exportSettings = validateAdminPlatformSettings(draft);
      const exportData = {
        format: "educonnect-admin-settings",
        version: 1,
        exportedAt: new Date().toISOString(),
        platformSettings: exportSettings,
        adminPreferences: { density },
      };
      const file = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const fileUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = `educonnect-admin-settings-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(fileUrl);
      setFeedback({ type: "success", message: "Current settings were exported as a JSON file." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Settings could not be exported." });
    }
  }

  async function handleImport(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 256 * 1024) {
        throw new Error("Settings import files must be smaller than 256 KB.");
      }
      const imported = JSON.parse(await file.text());
      if (
        imported?.format !== "educonnect-admin-settings" ||
        imported?.version !== 1 ||
        !ADMIN_DENSITY_OPTIONS.includes(imported?.adminPreferences?.density) ||
        !["general", "appearance", "rules", "marketplace", "system", "notifications"].every((group) =>
          imported?.platformSettings?.[group] &&
          typeof imported.platformSettings[group] === "object" &&
          !Array.isArray(imported.platformSettings[group])
        )
      ) {
        throw new Error("This file is not a supported EduConnect Admin settings export.");
      }
      const importedSettings = validateAdminPlatformSettings(imported.platformSettings);
      setDraft(importedSettings);
      setDensity(imported.adminPreferences.density);
      setFeedback({ type: "success", message: "Settings loaded into the form. Select Save Changes to apply them in this browser." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Settings could not be imported." });
    } finally {
      input.value = "";
    }
  }

  function handleTabKeyDown(event, index) {
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % SETTINGS_TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = SETTINGS_TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = SETTINGS_TABS[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`admin-settings-tab-${nextTab.id}`)?.focus();
  }

  const { general, appearance, rules, marketplace, system, notifications } = draft;

  return (
    <form className="edc-admin-settings-page" onSubmit={handleSave}>
      <header className="edc-admin-settings-page-heading">
        <div className="edc-admin-settings-page-title">
          <span className="edc-admin-settings-page-icon" aria-hidden="true"><Settings2 size={26} /></span>
          <div>
            <h2>Admin Settings</h2>
            <p>Configure browser-local preferences and review available platform controls.</p>
          </div>
        </div>
        <div className="edc-admin-settings-page-actions">
          <button type="button" className="edc-admin-settings-secondary-button" onClick={handleReset}><RotateCcw size={15} aria-hidden="true" />Reset to Default</button>
          <button type="button" className="edc-admin-settings-secondary-button" onClick={() => importInputRef.current?.click()}><Upload size={15} aria-hidden="true" />Import Settings</button>
          <input ref={importInputRef} className="edc-admin-visually-hidden" type="file" accept=".json,application/json" tabIndex={-1} aria-label="Import Admin settings JSON" onChange={handleImport} />
          <button type="button" className="edc-admin-settings-secondary-button" onClick={handleExport}><Download size={15} aria-hidden="true" />Export Settings</button>
          <button type="submit" className="edc-admin-settings-primary-button"><Save size={15} aria-hidden="true" />Save Changes</button>
        </div>
      </header>

      {feedback && <p className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</p>}
      {platformSettings?.error && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">{platformSettings.error}</p>}
      {preferences.error && <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">{preferences.error}</p>}

      <div className="edc-admin-settings-tabs" role="tablist" aria-label="Admin settings categories">
        {SETTINGS_TABS.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            id={`admin-settings-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`admin-settings-panel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            className={activeTab === id ? "active" : ""}
            onClick={() => setActiveTab(id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <Icon size={16} aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      <div className="edc-admin-settings-tab-content" id={`admin-settings-panel-${activeTab}`} role="tabpanel" aria-labelledby={`admin-settings-tab-${activeTab}`} tabIndex={0}>
        {activeTab === "general" && (
          <div className="edc-admin-settings-content-grid">
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="General Settings" description="Edit the platform identity and contact values saved in this browser." />
              <div className="edc-admin-settings-fields">
                <Field label="Platform Name"><input value={general.websiteName} onChange={(event) => update("general", "websiteName", event.target.value)} required /></Field>
                <Field label="Platform Tagline"><input value={general.tagline} onChange={(event) => update("general", "tagline", event.target.value)} /></Field>
                <Field label="Support Email"><input type="email" value={general.supportEmail} onChange={(event) => update("general", "supportEmail", event.target.value)} required /><small>Contact information only; outbound email delivery has not been set up here.</small></Field>
                <Field label="Default Language"><select value={general.language} onChange={(event) => update("general", "language", event.target.value)}><option>English</option><option>Urdu</option></select></Field>
                <Field label="Time Zone"><select value={general.timezone} onChange={(event) => update("general", "timezone", event.target.value)}><option value="Asia/Karachi">Asia/Karachi (PKT)</option><option value="UTC">UTC</option><option value="Asia/Dubai">Asia/Dubai</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option></select></Field>
              </div>
            </section>

            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Quick Configuration" description="Existing browser-saved controls; these do not replace server-side enforcement." />
              <div className="edc-admin-settings-toggles">
                <Toggle title="Allow New User Registration" description="Saved registration preference; this frontend setting does not block account creation." checked={system.registrationEnabled} onChange={(value) => update("system", "registrationEnabled", value)} />
                <Toggle title="Require Course Approval" description="Saved course publishing policy." checked={rules.courseApprovalRequired} onChange={(value) => update("rules", "courseApprovalRequired", value)} />
                <Toggle title="Enable Course Uploads" description="Configuration only; server upload controls are unavailable." checked={system.courseUploadEnabled} onChange={(value) => update("system", "courseUploadEnabled", value)} />
              </div>
            </section>

            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Platform Status" description="Status available from the current frontend settings store." />
              <div className={`edc-admin-settings-status${platformSettings?.error ? " is-unavailable" : ""}`}>
                <span className="edc-admin-settings-status-icon" aria-hidden="true">{platformSettings?.error ? <Info size={19} /> : <Check size={19} />}</span>
                <div><strong>{platformSettings?.error ? "Saved configuration unavailable" : "Browser configuration loaded"}</strong><p>{platformSettings?.error ? "The saved settings could not be read reliably." : "These settings are stored in this browser and are not shared across devices."}</p></div>
              </div>
            </section>

            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="System Information" description="No fabricated service metrics; only the settings scope is available." />
              <dl className="edc-admin-settings-details">
                <div><dt>Settings storage</dt><dd>Current browser localStorage</dd></div>
                <div><dt>Database connection</dt><dd>Not reported by this frontend</dd></div>
                <div><dt>Last settings update</dt><dd>Not recorded</dd></div>
                <div><dt>Production health</dt><dd>Unavailable in this demo</dd></div>
              </dl>
            </section>
          </div>
        )}

        {activeTab === "platform" && (
          <div className="edc-admin-settings-content-grid">
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Platform Rules" description="Review and publishing preferences used by the existing Admin workflows." />
              <div className="edc-admin-settings-toggles">
                <Toggle title="Course Approval Required" description="Keep course approval as a saved platform policy." checked={rules.courseApprovalRequired} onChange={(value) => update("rules", "courseApprovalRequired", value)} />
                <Toggle title="PDF/eBook Approval Required" description="Saved approval preference for submitted learning materials." checked={rules.ebookApprovalRequired} onChange={(value) => update("rules", "ebookApprovalRequired", value)} />
              </div>
              <div className="edc-admin-settings-fields">
                <Field label="Content Publishing Rule"><select value={rules.contentPublishingRules} onChange={(event) => update("rules", "contentPublishingRules", event.target.value)}><option>Approved content only</option><option>Admin review required</option><option>Allow teacher publishing</option></select></Field>
              </div>
            </section>

            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Platform Controls" description="These saved options do not activate backend restrictions in the frontend demo." />
              <div className="edc-admin-settings-toggles">
                <Toggle title="Registration Enabled" checked={system.registrationEnabled} onChange={(value) => update("system", "registrationEnabled", value)} />
                <Toggle title="Course Upload Enabled" checked={system.courseUploadEnabled} onChange={(value) => update("system", "courseUploadEnabled", value)} />
              </div>
              <div className="edc-admin-settings-fields">
                <Field label="PDF Upload Size Limit (MB)"><input type="number" min="1" max="500" step="1" value={system.pdfUploadLimitMb} onChange={(event) => update("system", "pdfUploadLimitMb", event.target.value)} required /></Field>
              </div>
              <p className="edc-admin-settings-note">Upload size and registration controls are stored preferences only; enforcement requires backend support.</p>
            </section>
          </div>
        )}

        {activeTab === "notifications" && (
          <div className="edc-admin-settings-content-grid edc-admin-settings-single-column">
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Admin Alert Preferences" description="Choose which saved platform activity appears in the Admin notification list." />
              <div className="edc-admin-settings-toggles">
                <Toggle title="New Teacher Application Alerts" checked={notifications.newTeacherApplicationAlerts} onChange={(value) => update("notifications", "newTeacherApplicationAlerts", value)} />
                <Toggle title="Course Approval Alerts" checked={notifications.courseApprovalAlerts} onChange={(value) => update("notifications", "courseApprovalAlerts", value)} />
                <Toggle title="Support & Appeal Alerts" checked={notifications.studentHelpRequestAlerts} onChange={(value) => update("notifications", "studentHelpRequestAlerts", value)} />
              </div>
              <p className="edc-admin-settings-note">These preferences filter the existing in-app notification list. Email delivery, PDF approval alert sources, and system announcements have not been set up in this application.</p>
            </section>
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Email Delivery" description="Email provider configuration is not available in the current frontend." />
              <UnavailableFeature text="SMTP/provider settings, delivery status, and email verification controls are not connected. No provider or delivery status is assumed." />
            </section>
          </div>
        )}

        {activeTab === "payments" && (
          <div className="edc-admin-settings-content-grid">
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Marketplace Defaults" description="Browser-local settings used to describe the demo marketplace." />
              <div className="edc-admin-settings-fields">
                <Field label="Display Currency"><select value={marketplace.currency} onChange={(event) => update("marketplace", "currency", event.target.value)}><option value="PKR">PKR — Pakistani Rupee</option><option value="USD">USD — US Dollar</option><option value="GBP">GBP — British Pound</option><option value="AED">AED — UAE Dirham</option></select></Field>
                <Field label="Configured Platform Commission (%)"><input type="number" min="0" max="50" step="0.1" value={marketplace.commissionRate} onChange={(event) => update("marketplace", "commissionRate", event.target.value)} required /></Field>
              </div>
              <div className="edc-admin-settings-toggles">
                <Toggle title="Free Content Allowed" checked={marketplace.allowFreeContent} onChange={(value) => update("marketplace", "allowFreeContent", value)} />
                <Toggle title="Paid Content Allowed" checked={marketplace.allowPaidContent} onChange={(value) => update("marketplace", "allowPaidContent", value)} />
                <Toggle title="Demo Checkout Mode" checked={marketplace.demoCheckoutMode} onChange={(value) => update("marketplace", "demoCheckoutMode", value)} />
              </div>
            </section>
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Payment Processing" description="Payment gateway and settlement services have not been set up here." />
              <UnavailableFeature text="No real payment provider, API credentials, settled revenue, payouts, or subscription service is connected. The configured commission and checkout values are not proof of processed payments." />
            </section>
          </div>
        )}

        {activeTab === "integrations" && (
          <section className="edc-admin-panel edc-admin-settings-panel edc-admin-settings-integration-panel">
            <SettingsHeading title="Integrations" description="Connected integration records available to this frontend." />
            <UnavailableFeature text="No external integrations are configured in the app. Email, payment, analytics, identity, and webhook connections cannot be managed from this screen." />
          </section>
        )}

        {activeTab === "appearance" && (
          <div className="edc-admin-settings-content-grid">
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Appearance & Theme" description="Update interface settings that are applied within the Admin workspace." />
              <div className="edc-admin-settings-fields">
                <Field label="Theme"><select value={appearance.theme} onChange={(event) => update("appearance", "theme", event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System preference</option></select></Field>
                <Field label="Sidebar Display"><select value={appearance.sidebar} onChange={(event) => update("appearance", "sidebar", event.target.value)}><option value="expanded">Expanded</option><option value="compact">Compact</option></select></Field>
                <Field label="Platform Logo URL"><input type="url" placeholder="Optional image URL" value={general.logoUrl} onChange={(event) => update("general", "logoUrl", event.target.value)} /><small>Used in the Admin sidebar when a URL is configured.</small></Field>
                <Field label="Favicon URL"><input type="url" placeholder="Optional image URL" value={general.faviconUrl} onChange={(event) => update("general", "faviconUrl", event.target.value)} /><small>Applied to the browser tab when a URL is configured.</small></Field>
              </div>
              <fieldset className="edc-admin-settings-options">
                <legend>Admin content spacing</legend>
                <Choice title="Comfortable" description="Standard spacing and card sizes." checked={density === "comfortable"} onChange={() => setDensity("comfortable")} name="admin-density" value="comfortable" />
                <Choice title="Compact" description="Fit more Admin content on screen." checked={density === "compact"} onChange={() => setDensity("compact")} name="admin-density" value="compact" />
              </fieldset>
            </section>
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Applied Preferences" description="Current form choices; select Save Changes to persist edits." />
              <dl className="edc-admin-settings-details">
                <div><dt>Theme</dt><dd>{appearance.theme === "system" ? "System preference" : appearance.theme === "dark" ? "Dark" : "Light"}</dd></div>
                <div><dt>Sidebar</dt><dd>{appearance.sidebar === "compact" ? "Compact" : "Expanded"}</dd></div>
                <div><dt>Content spacing</dt><dd>{density === "compact" ? "Compact" : "Comfortable"}</dd></div>
                <div><dt>Logo</dt><dd>{general.logoUrl ? "Configured" : "No custom logo URL"}</dd></div>
              </dl>
            </section>
          </div>
        )}

        {activeTab === "backup" && (
          <div className="edc-admin-settings-content-grid">
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Maintenance Configuration" description="A saved preference only; no server maintenance mode is available." />
              <div className="edc-admin-settings-toggles">
                <Toggle title="Maintenance Mode Preference" description="Does not take the platform offline in this frontend demo." checked={system.maintenanceMode} onChange={(value) => update("system", "maintenanceMode", value)} />
              </div>
              <UnavailableFeature text="Backend-wide maintenance controls, database backups, restore points, and storage usage are unavailable." />
            </section>
            <section className="edc-admin-panel edc-admin-settings-panel">
              <SettingsHeading title="Settings Backup" description="Export or import this browser's Admin settings as a JSON file." />
              <div className="edc-admin-settings-backup-actions">
                <button type="button" className="edc-admin-settings-secondary-button" onClick={handleExport}><Download size={15} aria-hidden="true" />Export Settings JSON</button>
                <button type="button" className="edc-admin-settings-secondary-button" onClick={() => importInputRef.current?.click()}><Upload size={15} aria-hidden="true" />Import Settings JSON</button>
              </div>
              <p className="edc-admin-settings-note">Importing loads values into this form first. Save Changes applies them to this browser only. This does not back up user, course, enrollment, or payment records.</p>
            </section>
          </div>
        )}
      </div>

      <p className="edc-admin-settings-note edc-admin-settings-page-note">Settings are stored locally in this browser. Platform and payment controls do not imply server-side enforcement or actual transactions.</p>
    </form>
  );
}

function SettingsHeading({ title, description }) {
  return <div className="edc-admin-settings-heading"><span className="edc-admin-settings-icon" aria-hidden="true"><Settings2 size={19} /></span><div><h3>{title}</h3><p>{description}</p></div></div>;
}

function Field({ label, children }) {
  return <label className="edc-admin-settings-field"><span>{label}</span>{children}</label>;
}

function Choice({ title, description, ...inputProps }) {
  return <label className="edc-admin-settings-option"><input type="radio" {...inputProps} /><span><strong>{title}</strong><small>{description}</small></span></label>;
}

function Toggle({ title, description, checked, onChange }) {
  return <label className="edc-admin-settings-toggle"><span><strong>{title}</strong>{description && <small>{description}</small>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}

function UnavailableFeature({ text }) {
  return <div className="edc-admin-settings-unavailable"><Info size={18} aria-hidden="true" /><p>{text}</p></div>;
}

export default AdminSettings;
