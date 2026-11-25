import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, FileDown } from "lucide-react";
import {
  ADMIN_ACTIVITY_LOG_KEY,
  ADMIN_AI_KNOWLEDGE_KEY,
  ADMIN_DATA_CHANGED_EVENT,
  ADMIN_USERS_KEY,
  getAdminTeachers,
} from "./adminData";
import { createCsvContent, downloadCsv } from "./adminCsvUtils";

const DATASET_CONFIG = [
  {
    id: "users",
    title: "Registered Users",
    description: "Current user identity, role, status, and available registration dates.",
  },
  {
    id: "teachers",
    title: "Teacher Applications",
    description: "Teacher account and application status information currently stored.",
  },
  {
    id: "courses",
    title: "Course Records",
    description: "Course details and approval statuses stored under registered teachers.",
  },
  {
    id: "knowledge",
    title: "AI Knowledge Proposals",
    description: "Proposal details and recorded review status; no processing results are included.",
  },
  {
    id: "activity",
    title: "Admin Activity Log",
    description: "Admin actions actually recorded in this browser’s activity log.",
  },
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readArray(key, label) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) {
      return { records: [], error: null, skipped: 0 };
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return {
        records: [],
        error: `Saved ${label} data is not in the expected array format.`,
        skipped: 0,
      };
    }

    const records = parsed.filter(isRecord);
    const skipped = parsed.length - records.length;
    return {
      records,
      error: null,
      skipped,
    };
  } catch {
    return {
      records: [],
      error: `Saved ${label} data could not be read.`,
      skipped: 0,
    };
  }
}

function valueFor(record, fields) {
  for (const field of fields) {
    const value = field.split(".").reduce((current, key) => current?.[key], record);
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      if (String(value).trim()) return value;
    }
  }
  return "";
}

function hasValue(record, fields) {
  return valueFor(record, fields) !== "";
}

function selectedColumns(records, definitions) {
  return definitions
    .filter((definition) =>
      records.some((record) => hasValue(record, definition.fields)),
    )
    .map(({ header, fields }) => ({
      header,
      getValue: (record) => valueFor(record, fields),
    }));
}

function getCourseRecords(teachers) {
  const records = [];
  const errors = [];
  let skipped = 0;
  const seen = new Set();
  const teacherByEmail = new Map(
    teachers.map((teacher) => [
      teacher.email.trim().toLowerCase(),
      teacher,
    ]),
  );

  teachers.forEach((teacher) => {
    const email = teacher.email.trim();
    const key = `educonnect.teacher.${email}.courses`;
    const courseState = readArray(key, "teacher course");
    if (courseState.error) {
      errors.push(courseState.error);
      return;
    }
    skipped += courseState.skipped;

    courseState.records.forEach((course) => {
      const identity =
        course.id === undefined || course.id === null || course.id === ""
          ? JSON.stringify(course)
          : String(course.id);
      const dedupeKey = `${email.toLowerCase()}:${identity}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const courseTeacher = teacherByEmail.get(email.toLowerCase());
      records.push({
        ...course,
        teacherEmail: email,
        teacherName:
          typeof courseTeacher?.name === "string" ? courseTeacher.name : "",
        teacherId:
          courseTeacher?.id ?? courseTeacher?.userId ?? "",
      });
    });
  });

  return { records, errors, skipped };
}

function makeDatasets() {
  const usersState = readArray(ADMIN_USERS_KEY, "registered user");
  const userRecords = usersState.records;
  const userError = usersState.error;
  const teacherRecords = getAdminTeachers(userRecords);

  const knowledgeState = readArray(ADMIN_AI_KNOWLEDGE_KEY, "AI knowledge proposal");
  const activityState = readArray(ADMIN_ACTIVITY_LOG_KEY, "Admin activity log");
  const courseState = getCourseRecords(teacherRecords);

  const rawDatasets = {
    users: {
      records: usersState.records,
      error: usersState.error,
      skipped: usersState.skipped,
      columns: [
        { header: "User ID", fields: ["id", "userId"] },
        { header: "Name", fields: ["name"] },
        { header: "Email", fields: ["email"] },
        { header: "Role", fields: ["role"] },
        { header: "Status", fields: ["status"] },
        { header: "Created date", fields: ["createdAt", "registeredAt"] },
      ],
    },
    teachers: {
      records: teacherRecords,
      error: userError,
      skipped: usersState.skipped,
      columns: [
        { header: "Teacher/Application ID", fields: ["applicationId", "id", "userId"] },
        { header: "Name", fields: ["name"] },
        { header: "Email", fields: ["email"] },
        { header: "Application status", fields: ["status", "teacherStatus"] },
        { header: "Submitted date", fields: ["appliedAt", "submittedAt", "createdAt", "registeredAt"] },
        { header: "Review date", fields: ["reviewedAt", "decisionAt", "reviewDate", "statusUpdatedAt"] },
      ],
    },
    courses: {
      records: courseState.records,
      error: courseState.errors[0] || userError,
      skipped: courseState.skipped,
      columns: [
        { header: "Course ID", fields: ["id", "courseId"] },
        { header: "Course title", fields: ["title", "name"] },
        { header: "Teacher name", fields: ["teacherName"] },
        { header: "Teacher email", fields: ["teacherEmail"] },
        { header: "Teacher ID", fields: ["teacherId"] },
        { header: "Course status", fields: ["status"] },
        { header: "Category", fields: ["category", "subject"] },
        { header: "Level", fields: ["level"] },
        { header: "Description", fields: ["description"] },
        { header: "Price", fields: ["price"] },
        { header: "Thumbnail", fields: ["thumbnail"] },
        { header: "Created date", fields: ["createdAt", "submittedAt", "submissionDate"] },
      ],
    },
    knowledge: {
      records: knowledgeState.records,
      error: knowledgeState.error,
      skipped: knowledgeState.skipped,
      columns: [
        { header: "Proposal ID", fields: ["proposalId", "id"] },
        { header: "Title", fields: ["proposedTopic", "courseSnapshot.title"] },
        { header: "Source course ID", fields: ["courseId"] },
        { header: "Teacher email", fields: ["teacherEmail"] },
        { header: "Source course title", fields: ["courseSnapshot.title"] },
        { header: "Status", fields: ["status"] },
        { header: "Created date", fields: ["submittedAt", "createdAt"] },
        { header: "Review date", fields: ["decisionAt", "reviewedAt"] },
      ],
    },
    activity: {
      records: activityState.records,
      error: activityState.error,
      skipped: activityState.skipped,
      columns: [
        { header: "Activity ID", fields: ["id"] },
        { header: "Action", fields: ["action"] },
        { header: "Target", fields: ["targetName"] },
        { header: "Target type", fields: ["entityType"] },
        { header: "Target ID", fields: ["entityId"] },
        { header: "Admin", fields: ["actor"] },
        { header: "Timestamp", fields: ["timestamp"] },
        { header: "Details", fields: ["description"] },
        { header: "Category", fields: ["category"] },
        { header: "Result", fields: ["result"] },
      ],
    },
  };

  return DATASET_CONFIG.map((config) => {
    const dataset = rawDatasets[config.id];
    const columns = selectedColumns(dataset.records, dataset.columns);
    return {
      ...config,
      records: dataset.records,
      columns,
      error: dataset.error,
      skipped: dataset.skipped,
    };
  });
}

function filenameFor(datasetId) {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `educonnect-${datasetId}-${date}.csv`;
}

function AdminDataExport() {
  const [datasets, setDatasets] = useState(makeDatasets);
  const [feedback, setFeedback] = useState(null);
  const [exportingId, setExportingId] = useState("");
  const exportingRef = useRef(false);

  const refreshDatasets = useCallback(() => {
    setDatasets(makeDatasets());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refreshDatasets);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshDatasets);
    return () => {
      window.removeEventListener("storage", refreshDatasets);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshDatasets);
    };
  }, [refreshDatasets]);

  function exportDataset(dataset) {
    if (
      exportingRef.current ||
      dataset.records.length === 0 ||
      dataset.error
    ) {
      return;
    }

    exportingRef.current = true;
    setFeedback(null);
    setExportingId(dataset.id);
    try {
      const content = createCsvContent(dataset.records, dataset.columns);
      downloadCsv(filenameFor(dataset.id), content);
      setFeedback({
        type: "success",
        message: `${dataset.title} CSV download started (${dataset.records.length} record${dataset.records.length === 1 ? "" : "s"}).`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : `${dataset.title} could not be exported.`,
      });
    } finally {
      exportingRef.current = false;
      setExportingId("");
    }
  }

  return (
    <section className="edc-admin-data-export">
      <p className="edc-admin-data-export-note">
        Exports use the records currently available in this browser’s localStorage. This is a frontend demo feature, not a secure production export.
      </p>

      {feedback && (
        <p
          className={`edc-admin-feedback edc-admin-feedback-${feedback.type}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}

      <div className="edc-admin-export-grid">
        {datasets.map((dataset) => {
          const canExport =
            !dataset.error &&
            dataset.records.length > 0 &&
            dataset.columns.length > 0;

          return (
            <article className="edc-admin-panel edc-admin-export-card" key={dataset.id}>
              <span className="edc-admin-export-icon" aria-hidden="true">
                <FileDown size={19} />
              </span>
              <div className="edc-admin-export-copy">
                <h3>{dataset.title}</h3>
                <p>{dataset.description}</p>
              </div>
              <p className="edc-admin-export-count">
                <strong>{dataset.records.length}</strong>{" "}
                record{dataset.records.length === 1 ? "" : "s"}
              </p>
              {dataset.error && (
                <p className="edc-admin-export-warning" role="alert">
                  <AlertTriangle size={14} aria-hidden="true" />
                  {dataset.error} Existing data was left unchanged.
                </p>
              )}
              {!dataset.error && dataset.skipped > 0 && (
                <p className="edc-admin-export-warning" role="status">
                  {dataset.skipped} malformed record{dataset.skipped === 1 ? " was" : "s were"} omitted.
                </p>
              )}
              <button
                className="edc-admin-export-button"
                type="button"
                disabled={!canExport || Boolean(exportingId)}
                onClick={() => exportDataset(dataset)}
                aria-label={`Export ${dataset.title} as CSV`}
              >
                <Download size={15} aria-hidden="true" />
                {exportingId === dataset.id ? "Preparing CSV…" : "Export CSV"}
              </button>
              {!dataset.error && dataset.records.length === 0 && (
                <small className="edc-admin-export-empty">
                  No records are currently available to export.
                </small>
              )}
              {!dataset.error && dataset.records.length > 0 && dataset.columns.length === 0 && (
                <small className="edc-admin-export-empty">
                  No supported export fields are available in these records.
                </small>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default AdminDataExport;
