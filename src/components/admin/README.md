# Admin workspace file guide

This folder contains the Admin dashboard screens and the browser-local demo data used by them.

## Main dashboard pages

The sidebar currently has 14 pages grouped under seven headings. These are the files used for each page:

| Admin page | File |
| --- | --- |
| Overview Dashboard | `AdminOverview.jsx` |
| User Management | `AdminUserManagement.jsx` |
| Teacher Applications | `AdminTeacherApplications.jsx` |
| Course Review | `AdminCourseReview.jsx` |
| Knowledge Proposals | `AdminKnowledgeGovernance.jsx` |
| Moderation & Governance | `AdminModerationGovernance.jsx` |
| Tutor Marketplace | `AdminTutorMarketplace.jsx` |
| Financial Management | `AdminFinancialManagement.jsx` |
| AI Operations | `AdminAIOperations.jsx` |
| Security & Privacy | `AdminSecurity.jsx` |
| Support & Appeals | `AdminSupportModeration.jsx` |
| Audit Logs | `AdminActivityLog.jsx` |
| Reports & Analytics | `AdminAnalytics.jsx` |
| Settings & Configuration | `AdminSettings.jsx` |

Some additional routes are intentionally hidden from the sidebar: `AdminBookApprovals.jsx`, `AdminDataImport.jsx`, `AdminDataExport.jsx`, `AdminNotifications.jsx`, and `AdminSystemHealth.jsx`. Support and security detail routes reuse their main feature screen instead of creating another component for each page.

## Shared Admin files

- `AdminLayout.jsx`, `AdminSidebar.jsx`, and `AdminTopbar.jsx` assemble the Admin workspace.
- `adminNavigation.js` defines page routes and sidebar groups.
- `adminData.js` stores and reads shared Admin demo records.
- `adminOperationsData.js` and `adminNotificationData.js` handle operations and alerts.
- `adminSettings.js` stores the Admin's local display preference; `adminPlatformSettings.js` stores platform configuration.
- `adminCsvUtils.js` contains CSV import, validation, export, and download helpers.
- `createDemoAdmin.js` supports the development-only setup screen in `AdminDemoSetup.jsx`.
- `Admin.css` contains the Admin workspace styles.

Most Admin records are stored in this browser for the frontend demo. They are not shared across browsers or devices.

Admin Settings organizes existing browser-local controls into categories. Its JSON import/export includes platform settings and Admin display preferences only; it is not a backup of user, course, enrollment, or payment records. Database health, production storage metrics, payment integrations, and email delivery are not available in this frontend.

Moderation UI and shared Student/Teacher moderation helpers remain in `src/components/moderation` and `src/utils` because both dashboards use them.
