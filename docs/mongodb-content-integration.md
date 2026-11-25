# EduConnect AI content integration

The existing Teacher My Courses, Course Editor, Lessons, Curriculum Builder and My PDF/eBooks pages now save through the authenticated content APIs. The existing Admin Course Review and Book Approvals pages review MongoDB submissions. Student course, learning, curriculum and book pages consume the server-approved catalog.

Teacher edits update a working version. Admin approval captures the complete reviewed metadata, lessons and file references in an approved snapshot and publishes it. Later edits, submissions and rejection of a revision leave the previous approved snapshot available until an Admin approves a replacement or unpublishes the content. New rejected or pending submissions have no public snapshot.

**Persistence and authorization**

- Existing `owned_courses` and `owned_teacher_books` collection names are retained. New fields record revisions, publication, reviewer identity, review time and rejection reasons.
- Course lessons are embedded in the working course and its approved snapshot so a conditional document update publishes a consistent version on standalone MongoDB. Original Part C `owned_lessons` records are read when an older course has no embedded lessons. Original lesson rows are retained after materialization.
- Ownership comes from the HttpOnly authenticated session. Teacher writes cannot set approval, publication, reviewer identity or ownership. Admin review routes require the Admin role. CNIC status does not gate creation or uploads.
- Stale edits and reviews return HTTP 409. Content writes use the current revision as a condition. Teacher removals unpublish and mark records deleted while retaining their stored records and files.
- Student access is recorded in `contentaccesses`, scoped to the authenticated Student and content ID. Browser enrollment, purchase records and prices cannot authorize private backend files.
- Private files live in `backend/uploads/content`. Express serves them only through authorized routes. Vite denies direct access to upload paths, including its `/@fs/` route. File responses support range requests for video playback.
- Upload limits are 250 MB for MP4/WebM, 20 MB for book PDFs and lesson documents, 5 MB for preview PDFs and 1 MB for images. MIME types and file signatures are checked. Supported curriculum documents include PDF, text, Markdown, CSV, ZIP, DOCX, PPTX, XLSX and images. Document downloads use attachment disposition.
- Existing authentication, HttpOnly cookies, login protection, password recovery, identity verification, badges and styling are retained. There are no separate Secure Content or MongoDB Library pages.

**Existing browser content and migration**

No automatic migration was run. Existing MongoDB records, browser records and IndexedDB files were retained.

1. Log in as the Teacher who owns the browser content on its original browser and origin.
2. Use **Import browser courses** in My Courses or **Import browser books** in My PDF/eBooks.
3. The importer reads the owner's local metadata and original files, including course curriculum attachments. It prepares a JSON backup containing metadata and base64 file contents. Missing original files stop the import before any content records are written.
4. Save the backup and confirm its download in the importer before proceeding.
5. Records are imported as Drafts under the authenticated Teacher ID. A unique `(teacherId, legacyId)` index prevents duplicate content on retries. Completed records are skipped when the import is repeated. If an import fails partway, the message reports the number completed.
6. Open imported courses and books, check the metadata and files, then submit them through the existing approval action. External lesson video links import as Draft lessons requiring media re-upload before submission. Their original references remain in the backup and original browser records.
7. Original browser metadata and files are retained. Browser-only paid receipts do not grant server access. Production access for historical buyers requires verified purchase records before an authorized server-side entitlement is issued.

Old Part C MongoDB records with only a `published` status have no Admin-approved snapshot. They appear as Drafts to their owners and stay outside the Student catalog until explicitly submitted and approved. Old book descriptions without PDFs require a file upload before submission.

**Checkout behavior and operational limits**

Free enrollment and book access persist through the backend. The project's existing demo checkout remains available in development and creates server-side demo access using current approved prices. Set `CONTENT_DEMO_CHECKOUT=false` to disable paid demo grants.

With `NODE_ENV=production`, demo access does not authorize content. Paid enrollment returns HTTP 402 until a verified payment integration or a separately verified server-side entitlement exists. A production payment-provider/webhook integration was not added because the project supplies no payment provider or merchant configuration.

New writes refresh the local view immediately. Other sessions refresh on focus and every 15 seconds while their tab is visible. Runtime content refresh errors are logged, and existing management pages show save/load failures. This integration does not add WebSockets.

Back up MongoDB together with `backend/uploads/content` when moving the backend. Keep the uploads directory outside any production static-file host or public reverse-proxy alias. The Vite configuration already protects the development server.

**Verification**

Run the frontend build from the project directory and the backend tests from `backend`.

```powershell
npm.cmd run build
Set-Location backend
npm.cmd test
```

The backend suite passed all 27 tests. It uses a unique `educonnect_content_test_*` database on local MongoDB at port 27017 and deletes only that disposable test database and files created by the suite. It does not use the application database or real accounts. The frontend build passed with Vite's existing large-chunk warning.

The suite covers real login cookies, unverified Teacher creation, ownership, status-field tampering, submission, Admin review, reviewer persistence, rejection/resubmission, immutable approved versions, stale/concurrent writes, enrollment, paid-access protection, upload validation, private PDF/video/document access, previews, streaming ranges, legacy MongoDB reads, Vite filesystem protection and the actual frontend API adapter against the backend.

Six existing React pages were also server-rendered through Vite without errors. This checks component rendering and absence of the removed sections. Interactive browser clicks and actual video decoding were not verified by that render check.

**Files changed for this integration**

| File | Change |
| --- | --- |
| `backend/package.json` | Runs the backend test suite. |
| `backend/src/app.js` | Allows validated course JSON up to 12 MB while retaining other request limits. |
| `backend/src/models/Course.js` | Working course metadata, embedded lessons and review snapshots. |
| `backend/src/models/TeacherBook.js` | Working book metadata and review snapshots. |
| `backend/src/models/contentFields.js` | Shared review fields and duplicate-prevention indexes. |
| `backend/src/models/ContentFile.js` | Private uploaded-file metadata and ownership. |
| `backend/src/models/ContentAccess.js` | Persisted Student access and unique grants. |
| `backend/src/services/contentService.js` | Validation, legacy reads, version writes and approved presentation. |
| `backend/src/controllers/contentController.js` | Content CRUD, lessons, submission, review, catalog and enrollment. |
| `backend/src/controllers/contentFileController.js` | Validated private uploads and authorized streaming. |
| `backend/src/middleware/contentGuards.js` | Server-loaded ownership and approved access checks. |
| `backend/src/routes/contentRoutes.js` | Connects the existing APIs and new review/file/access endpoints. |
| `backend/src/utils/contentAuthorization.js` | Requires an approved publication for Student visibility. |
| `backend/tests/contentOwnership.test.mjs` | Approval-aware ownership and visibility regressions. |
| `backend/tests/contentWorkflow.test.mjs` | HTTP, MongoDB, file, concurrency and frontend adapter integration tests. |
| `src/App.jsx` | Starts shared content synchronization. |
| `src/pages/DashboardPage.jsx` | Refreshes authenticated content and clears it on logout. |
| `src/pages/dashboards/TeacherDashboard.jsx` | Backend course/lesson writes, upload, submission and explicit browser import. |
| `src/pages/dashboards/TeacherCourseEditor.jsx` | Preserves metadata and edits requirements/learning outcomes using existing form styles. |
| `src/pages/dashboards/StudentDashboard.jsx` | Approved learning data, persisted access, private playback and checkout. |
| `src/components/books/TeacherBooks.jsx` | Backend PDFs, book metadata, submission, edits, removal and explicit browser import. |
| `src/components/books/BookTeacherHub.jsx` | Backend free-book access before authorized PDF reads. |
| `src/components/admin/adminData.js` | Reads server-managed courses for existing Admin pages. |
| `src/components/admin/AdminCourseReview.jsx` | Backend decisions, reasons and material previews. |
| `src/components/admin/AdminBookApprovals.jsx` | Backend book decisions and load errors. |
| `src/components/teacher/TeacherLessons.jsx` | Recognizes backend videos and opens authorized previews. |
| `src/components/student/StudentEbooks.jsx` | Uses current published records for backend books. |
| `src/components/curriculum/CurriculumBuilder.jsx` | Saves course structure/resources through the existing Teacher workflow. |
| `src/components/curriculum/studentCurriculumHelpers.js` | Reads approved curriculum and authorized resources. |
| `src/components/Marketplace/CartPage.jsx` | Awaits backend enrollment before checkout success. |
| `src/utils/teacherCourses.js` | Reads the approved server catalog. |
| `src/utils/books.js` | Server book data, authorized file reads and Admin decisions. |
| `src/utils/studentCart.js` | Persists access before checkout and preserves existing progress. |
| `src/utils/studentRecommendations.js` | Reads approved curriculum attachments and backend files. |
| `src/utils/contentApi.js` | Shared authenticated adapter, catalog/session state and file/access operations. |
| `src/utils/useContentSync.js` | Route, focus and visible-tab synchronization. |
| `src/utils/importBrowserContent.js` | Explicit backup-first browser import with retry protection. |
| `vite.config.js` | Blocks direct access to private uploads while retaining Vite's default denied files. |
| `docs/mongodb-content-integration.md` | Migration plan, verification and implementation report. |

No application files were deleted for this integration. Pre-existing unrelated workspace changes were retained.
