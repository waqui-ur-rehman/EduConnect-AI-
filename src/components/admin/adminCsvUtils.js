import {
  ADMIN_AI_KNOWLEDGE_KEY,
  ADMIN_DATA_CHANGED_EVENT,
  ADMIN_USERS_KEY,
  appendAdminActivityRecord,
  getAdminTeachers,
  notifyAdminDataChanged,
} from "./adminData";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 5000;
const COURSE_STATUSES = [
  "Draft",
  "Submitted",
  "AI Review",
  "Admin Review",
  "Pending Approval",
  "Changes Requested",
  "Approved",
  "Published",
  "Rejected",
  "Suspended",
];
const KNOWLEDGE_STATUSES = [
  "Pending Review",
  "Approved for Processing",
  "Changes Requested",
  "Rights Evidence Requested",
  "Rejected",
];

export const IMPORT_CATEGORIES = [
  {
    id: "courses",
    label: "Course Records",
    description:
      "Add courses to one existing teacher account as Drafts. CSV status values are never applied.",
  },
  {
    id: "knowledge",
    label: "AI Knowledge Proposals",
    description:
      "Add proposals linked to an existing course for Pending Review. No proposal is approved or processed.",
  },
];

const SCHEMAS = {
  courses: {
    required: ["course id", "course title", "teacher email"],
    supported: [
      "course id",
      "course title",
      "teacher email",
      "description",
      "category",
      "level",
      "price",
      "thumbnail",
      "created date",
      "course status",
      "status",
    ],
  },
  knowledge: {
    required: ["proposal id", "title", "source course id", "teacher email"],
    supported: [
      "proposal id",
      "title",
      "source course id",
      "teacher email",
      "status",
      "created date",
    ],
  },
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeHeader(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function readStorageArray(key, label) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return { raw, records: [], error: null };
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) {
      return {
        raw,
        records: [],
        error: `Saved ${label} data is not in the expected array format.`,
      };
    }
    return { raw, records, error: null };
  } catch {
    return {
      raw: null,
      records: [],
      error: `Saved ${label} data could not be read.`,
    };
  }
}

function getCell(row, headerMap, header) {
  const index = headerMap.get(header);
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function findCourse(teachers, teacherEmail, courseId) {
  const normalizedEmail = teacherEmail.trim().toLowerCase();
  const teacher = teachers.find(
    (record) =>
      typeof record.email === "string" &&
      record.email.trim().toLowerCase() === normalizedEmail,
  );
  if (!teacher) return { error: "Teacher email does not match a registered teacher." };

  const storageKey = `educonnect.teacher.${teacher.email}.courses`;
  const state = readStorageArray(storageKey, "teacher course");
  if (state.error) return { error: state.error };

  const matches = state.records.filter(
    (course) =>
      isRecord(course) &&
      course.id !== undefined &&
      course.id !== null &&
      String(course.id) === courseId,
  );
  if (matches.length !== 1) {
    return {
      error:
        matches.length === 0
          ? "Source course ID was not found for this teacher."
          : "Source course ID is ambiguous for this teacher.",
    };
  }

  return { course: matches[0], teacher, storageKey, state };
}

function copyCourseSnapshot(course) {
  const snapshot = {};
  [
    "title",
    "subtitle",
    "description",
    "category",
    "subject",
    "level",
    "language",
    "createdAt",
  ].forEach((field) => {
    if (typeof course[field] === "string" || typeof course[field] === "number") {
      snapshot[field] = course[field];
    }
  });
  if (Array.isArray(course.lessons)) {
    snapshot.lessons = course.lessons
      .filter(isRecord)
      .map((lesson) => {
        const result = {};
        ["id", "title", "description", "duration"].forEach((field) => {
          if (
            typeof lesson[field] === "string" ||
            typeof lesson[field] === "number"
          ) {
            result[field] = lesson[field];
          }
        });
        if (typeof lesson.isFreePreview === "boolean") {
          result.isFreePreview = lesson.isFreePreview;
        }
        return result;
      });
  }
  return snapshot;
}

export function parseCsv(text) {
  if (typeof text !== "string" || !text.length) {
    throw new Error("The selected CSV file is empty.");
  }

  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let afterQuote = false;

  function finishCell() {
    row.push(cell);
    cell = "";
    afterQuote = false;
  }

  function finishRow() {
    finishCell();
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
    row = [];
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        finishCell();
      } else if (character === "\r" || character === "\n") {
        finishRow();
        if (character === "\r" && source[index + 1] === "\n") index += 1;
      } else {
        throw new Error("The CSV contains characters after a closing quotation mark.");
      }
      continue;
    }

    if (character === '"') {
      if (cell.length !== 0) {
        throw new Error("The CSV contains a quotation mark inside an unquoted value.");
      }
      inQuotes = true;
    } else if (character === ",") {
      finishCell();
    } else if (character === "\r" || character === "\n") {
      finishRow();
      if (character === "\r" && source[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }

  if (inQuotes) {
    throw new Error("The CSV contains an unclosed quoted value.");
  }
  if (row.length || cell.length || afterQuote) finishRow();

  if (rows.length === 0) {
    throw new Error("The selected CSV file does not contain a header row.");
  }

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) {
    throw new Error("The CSV header row contains a missing column name.");
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error("The CSV contains duplicate column names.");
  }
  if (rows.length - 1 > MAX_DATA_ROWS) {
    throw new Error(`The CSV exceeds the ${MAX_DATA_ROWS} row import limit.`);
  }

  return {
    headers,
    rows: rows.slice(1).map((cells, index) => ({
      cells,
      rowNumber: index + 2,
    })),
  };
}

export function validateImport(parsed, category) {
  const schema = SCHEMAS[category];
  if (!schema) {
    return {
      headerErrors: ["Choose a supported import category."],
      headerWarnings: [],
      rows: [],
      totalRows: parsed?.rows?.length ?? 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      importableCount: 0,
      storageError: "",
    };
  }

  const headerMap = new Map(
    parsed.headers.map((header, index) => [normalizeHeader(header), index]),
  );
  const headerErrors = schema.required
    .filter((header) => !headerMap.has(header))
    .map((header) => `Required column “${header}” is missing.`);
  const headerWarnings = parsed.headers
    .map(normalizeHeader)
    .filter((header) => !schema.supported.includes(header))
    .map((header) => `Unsupported column “${header}” will be ignored.`);

  if (headerErrors.length) {
    return {
      headerErrors,
      headerWarnings,
      rows: parsed.rows.map((row) => ({
        ...row,
        errors: ["Required columns are missing."],
        warnings: [],
        duplicate: false,
        candidate: null,
      })),
      totalRows: parsed.rows.length,
      validCount: 0,
      invalidCount: parsed.rows.length,
      duplicateCount: 0,
      importableCount: 0,
      storageError: "",
    };
  }

  const usersState = readStorageArray(ADMIN_USERS_KEY, "registered user");
  if (usersState.error) {
    return {
      headerErrors,
      headerWarnings,
      rows: [],
      totalRows: parsed.rows.length,
      validCount: 0,
      invalidCount: parsed.rows.length,
      duplicateCount: 0,
      importableCount: 0,
      storageError: usersState.error,
    };
  }
  const teachers = getAdminTeachers(usersState.records.filter(isRecord));
  const knowledgeState =
    category === "knowledge"
      ? readStorageArray(ADMIN_AI_KNOWLEDGE_KEY, "AI knowledge proposal")
      : null;
  if (knowledgeState?.error) {
    return {
      headerErrors,
      headerWarnings,
      rows: [],
      totalRows: parsed.rows.length,
      validCount: 0,
      invalidCount: parsed.rows.length,
      duplicateCount: 0,
      importableCount: 0,
      storageError: knowledgeState.error,
    };
  }

  const existingProposalIds = new Set(
    (knowledgeState?.records ?? [])
      .filter(isRecord)
      .map((proposal) => String(proposal.proposalId ?? "")),
  );
  const existingProposalCourses = new Set(
    (knowledgeState?.records ?? [])
      .filter(isRecord)
      .map(
        (proposal) =>
          `${String(proposal.teacherEmail ?? "").trim().toLowerCase()}:${String(proposal.courseId ?? "")}`,
      ),
  );
  const seenIds = new Set();
  const seenProposalCourses = new Set();

  const validatedRows = parsed.rows.map((row) => {
    const errors = [];
    const warnings = [];
    if (row.cells.length !== parsed.headers.length) {
      errors.push("The number of values does not match the header columns.");
    }

    const teacherEmail = getCell(row, headerMap, "teacher email");
    const normalizedEmail = teacherEmail.toLowerCase();
    const teacher = teachers.find(
      (record) =>
        typeof record.email === "string" &&
        record.email.trim().toLowerCase() === normalizedEmail,
    );
    let candidate = null;
    let duplicate = false;

    if (!teacher) {
      errors.push("Teacher email does not match a registered teacher.");
    }

    if (category === "courses") {
      const id = getCell(row, headerMap, "course id");
      const title = getCell(row, headerMap, "course title");
      if (!id) errors.push("Course ID is required.");
      if (!title) errors.push("Course title is required.");

      const sourceStatus = getCell(row, headerMap, "course status");
      if (headerMap.has("course status")) {
        if (!sourceStatus) {
          errors.push("Course status is empty; only Draft records can be imported.");
        } else if (!COURSE_STATUSES.includes(sourceStatus)) {
          errors.push(`Course status “${sourceStatus}” is not supported.`);
        } else if (sourceStatus !== "Draft") {
          errors.push("Only Draft courses can be imported; source status is not applied.");
        }
      } else if (headerMap.has("status")) {
        const status = getCell(row, headerMap, "status");
        if (!status || !COURSE_STATUSES.includes(status)) {
          errors.push("Course status is not a supported value.");
        } else if (status !== "Draft") {
          errors.push("Only Draft courses can be imported; source status is not applied.");
        }
      }

      const priceValue = getCell(row, headerMap, "price");
      let price = "";
      if (priceValue) {
        price = Number(priceValue);
        if (!Number.isFinite(price) || price < 0) {
          errors.push("Price must be a non-negative number.");
        }
      }

      const dateHeader = headerMap.has("created date")
        ? "created date"
        : headerMap.has("created at")
          ? "created at"
          : "";
      const createdAtValue = dateHeader
        ? getCell(row, headerMap, dateHeader)
        : "";
      const createdAt = createdAtValue ? validDate(createdAtValue) : null;
      if (createdAtValue && !createdAt) {
        errors.push("Created date must be a valid date.");
      }

      const thumbnail = getCell(row, headerMap, "thumbnail");
      if (thumbnail) {
        const safeImageData =
          /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(thumbnail);
        const safeWebUrl = (() => {
          try {
            const url = new URL(thumbnail);
            return ["http:", "https:"].includes(url.protocol);
          } catch {
            return false;
          }
        })();
        if (!safeImageData && !safeWebUrl) {
          errors.push("Thumbnail must be an HTTP(S) URL or supported image data URL.");
        }
      }

      if (id && teacher) {
        const key = teacher.email.trim().toLowerCase();
        const duplicateKey = `${key}:${id}`;
        const courseState = readStorageArray(
          `educonnect.teacher.${teacher.email}.courses`,
          "teacher course",
        );
        if (courseState.error) {
          errors.push(courseState.error);
        }
        const existingIds = new Set(
          courseState.records
            .filter(isRecord)
            .map((course) => String(course.id ?? "")),
        );
        if (existingIds.has(id) || seenIds.has(duplicateKey)) {
          duplicate = true;
          warnings.push("A course with this ID already exists for this teacher.");
        }
      }

      candidate = {
        id,
        title,
        teacherEmail: teacher?.email ?? "",
        category: getCell(row, headerMap, "category") || "Development",
        level: getCell(row, headerMap, "level") || "Beginner",
        description: getCell(row, headerMap, "description"),
        price,
        thumbnail,
        status: "Draft",
        lessons: [],
        ...(createdAt ? { createdAt } : {}),
      };
    } else {
      const proposalId = getCell(row, headerMap, "proposal id");
      const title = getCell(row, headerMap, "title");
      const courseId = getCell(row, headerMap, "source course id");
      if (!proposalId) errors.push("Proposal ID is required.");
      if (!title) errors.push("Proposal title is required.");
      if (!courseId) errors.push("Source course ID is required.");

      const sourceStatus = getCell(row, headerMap, "status");
      if (headerMap.has("status")) {
        if (!KNOWLEDGE_STATUSES.includes(sourceStatus)) {
          errors.push(`Proposal status “${sourceStatus || "(empty)"}” is not supported.`);
        } else if (sourceStatus !== "Pending Review") {
          errors.push("Only Pending Review proposals can be imported.");
        }
      }

      const createdDate = getCell(row, headerMap, "created date");
      const submittedAt = createdDate ? validDate(createdDate) : null;
      if (createdDate && !submittedAt) {
        errors.push("Created date must be a valid date.");
      }

      const courseReference =
        teacher && courseId
          ? findCourse(teachers, teacher.email, courseId)
          : null;
      if (courseReference?.error) errors.push(courseReference.error);

      const normalizedCourseKey =
        `${normalizedEmail}:${courseId}`;
      if (proposalId) {
        if (existingProposalIds.has(proposalId) || seenIds.has(`proposal:${proposalId}`)) {
          duplicate = true;
          warnings.push("A proposal with this ID already exists.");
        }
      }
      if (teacher && courseId) {
        if (
          existingProposalCourses.has(normalizedCourseKey) ||
          seenProposalCourses.has(normalizedCourseKey)
        ) {
          duplicate = true;
          warnings.push("A proposal already exists for this teacher and course.");
        }
      }

      if (courseReference?.course && teacher) {
        const course = courseReference.course;
        candidate = {
          proposalId,
          courseId,
          teacherEmail: teacher.email.trim().toLowerCase(),
          proposedTopic: title,
          status: "Pending Review",
          ...(submittedAt ? { submittedAt } : {}),
          courseSnapshot: copyCourseSnapshot(course),
          ...(typeof teacher.name === "string" && teacher.name.trim()
            ? { teacherName: teacher.name.trim() }
            : {}),
          ...(typeof course.category === "string" && course.category.trim()
            ? { subject: course.category.trim() }
            : typeof course.subject === "string" && course.subject.trim()
              ? { subject: course.subject.trim() }
              : {}),
          ...(typeof course.level === "string" && course.level.trim()
            ? { academicLevel: course.level.trim() }
            : {}),
          ...(typeof course.language === "string" && course.language.trim()
            ? { language: course.language.trim() }
            : {}),
        };
      }
    }

    if (errors.length === 0 && !duplicate) {
      if (category === "courses" && teacher) {
        seenIds.add(
          `${teacher.email.trim().toLowerCase()}:${getCell(row, headerMap, "course id")}`,
        );
      } else if (category === "knowledge") {
        seenIds.add(`proposal:${getCell(row, headerMap, "proposal id")}`);
        seenProposalCourses.add(
          `${normalizedEmail}:${getCell(row, headerMap, "source course id")}`,
        );
      }
    }

    return {
      ...row,
      errors,
      warnings,
      duplicate,
      candidate: errors.length === 0 && !duplicate ? candidate : null,
    };
  });

  if (category === "courses") {
    const teacherEmails = new Set(
      validatedRows
        .filter((row) => row.errors.length === 0 && row.candidate)
        .map((row) => row.candidate.teacherEmail.toLowerCase()),
    );
    if (teacherEmails.size > 1) {
      headerErrors.push(
        "A course import file must refer to one registered teacher.",
      );
      validatedRows.forEach((row) => {
        row.errors.push("Course records in one import must have the same teacher.");
        row.candidate = null;
      });
    }
  }

  const validCount = validatedRows.filter((row) => row.errors.length === 0).length;
  const duplicateCount = validatedRows.filter(
    (row) => row.duplicate && row.errors.length === 0,
  ).length;
  const invalidCount = validatedRows.filter((row) => row.errors.length > 0).length;
  const importableCount = validatedRows.filter((row) => row.candidate).length;

  return {
    headerErrors,
    headerWarnings,
    rows: validatedRows,
    totalRows: parsed.rows.length,
    validCount,
    invalidCount,
    duplicateCount,
    importableCount,
    storageError: "",
  };
}

export function checkImportFile(file) {
  if (!file) throw new Error("Select a CSV file first.");
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new Error("Choose a file with the .csv extension.");
  }
  if (file.size === 0) throw new Error("The selected CSV file is empty.");
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("CSV files must be 5 MB or smaller.");
  }
}

export function commitImport(parsed, category, actor, filename) {
  const validation = validateImport(parsed, category);
  if (validation.storageError) throw new Error(validation.storageError);
  if (validation.headerErrors.length) {
    throw new Error(validation.headerErrors.join(" "));
  }
  if (!validation.importableCount) {
    throw new Error("There are no valid, non-duplicate records to import.");
  }

  const candidates = validation.rows
    .filter((row) => row.candidate)
    .map((row) => row.candidate);
  const key =
    category === "courses"
      ? `educonnect.teacher.${candidates[0].teacherEmail}.courses`
      : ADMIN_AI_KNOWLEDGE_KEY;
  if (
    category === "courses" &&
    candidates.some((record) => record.teacherEmail !== candidates[0].teacherEmail)
  ) {
    throw new Error("A course import file must refer to one registered teacher.");
  }

  const existing = readStorageArray(
    key,
    category === "courses" ? "teacher course" : "AI knowledge proposal",
  );
  if (existing.error) throw new Error(existing.error);

  const nextRecords = [...existing.records, ...candidates];
  let wroteDataset = false;
  try {
    window.localStorage.setItem(key, JSON.stringify(nextRecords));
    wroteDataset = true;
    appendAdminActivityRecord({
      actor,
      action: "Imported data",
      category: "data-import",
      entityType: category === "courses" ? "Course Records" : "AI Knowledge Proposals",
      entityId: `${candidates.length} records`,
      targetName:
        category === "courses" ? "Course Records" : "AI Knowledge Proposals",
      description: `Imported ${candidates.length} ${category === "courses" ? "course record" : "AI knowledge proposal"}${candidates.length === 1 ? "" : "s"} from ${filename}.`,
      result: "Success",
    });
  } catch (error) {
    if (wroteDataset) {
      try {
        if (existing.raw === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, existing.raw);
        }
        notifyAdminDataChanged();
      } catch {
        throw new Error(
          `Import logging failed and the imported data could not be fully rolled back. Refresh and verify the ${category === "courses" ? "course" : "proposal"} records before retrying.`,
        );
      }
    }
    if (error instanceof Error) {
      throw new Error(`Import was not completed: ${error.message}`, {
        cause: error,
      });
    }
    throw new Error("Import was not completed because browser storage failed.", {
      cause: error,
    });
  }

  return {
    importedCount: candidates.length,
    skippedCount: validation.totalRows - candidates.length,
    invalidCount: validation.invalidCount,
    duplicateCount: validation.duplicateCount,
  };
}

export { ADMIN_DATA_CHANGED_EVENT };


/* CSV export and safe download helpers */
function csvCell(value) {
  if (value === null || value === undefined) {
    return '""';
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? `"${String(value)}"` : '""';
  }

  if (typeof value !== "string" && typeof value !== "boolean") {
    return '""';
  }

  let text = String(value);
  if (/^(?:\uFEFF|[ \t\r\n])*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

export function createCsvContent(rows, columns) {
  if (!Array.isArray(rows) || !Array.isArray(columns) || columns.length === 0) {
    throw new Error("CSV export requires rows and at least one column.");
  }

  const headers = columns.map((column) => {
    if (!column || typeof column.header !== "string" || typeof column.getValue !== "function") {
      throw new Error("CSV export column definitions are invalid.");
    }
    return csvCell(column.header);
  });

  const records = rows.map((row) =>
    columns.map((column) => csvCell(column.getValue(row))).join(","),
  );

  return `\uFEFF${[headers.join(","), ...records].join("\r\n")}`;
}

export function downloadCsv(filename, content) {
  if (typeof filename !== "string" || !filename.trim() || typeof content !== "string") {
    throw new Error("CSV download details are invalid.");
  }

  if (
    typeof window.URL?.createObjectURL !== "function" ||
    typeof window.Blob !== "function"
  ) {
    throw new Error("CSV downloads are not supported by this browser.");
  }

  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  try {
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
  } catch (error) {
    window.URL.revokeObjectURL(url);
    throw error;
  } finally {
    link.remove();
  }

  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
