import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FileUp, RotateCcw, Upload } from "lucide-react";
import {
  ADMIN_DATA_CHANGED_EVENT,
  IMPORT_CATEGORIES,
  checkImportFile,
  commitImport,
  parseCsv,
  validateImport,
} from "./adminCsvUtils";

const PREVIEW_ROW_LIMIT = 10;
const PREVIEW_COLUMN_LIMIT = 8;

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function AdminDataImport({ email }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [category, setCategory] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [fileError, setFileError] = useState("");
  const [result, setResult] = useState(null);
  const [, setStorageVersion] = useState(0);
  const fileInputRef = useRef(null);
  const parseSequenceRef = useRef(0);

  const refreshStorage = useCallback(() => {
    setStorageVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refreshStorage);
    window.addEventListener(ADMIN_DATA_CHANGED_EVENT, refreshStorage);
    return () => {
      window.removeEventListener("storage", refreshStorage);
      window.removeEventListener(ADMIN_DATA_CHANGED_EVENT, refreshStorage);
    };
  }, [refreshStorage]);

  const validation =
    parsed && category ? validateImport(parsed, category) : null;

  async function selectFile(file) {
    const sequence = parseSequenceRef.current + 1;
    parseSequenceRef.current = sequence;
    setSelectedFile(file);
    setParsed(null);
    setFileError("");
    setResult(null);

    try {
      checkImportFile(file);
    } catch (error) {
      setIsParsing(false);
      setFileError(error instanceof Error ? error.message : "The file could not be selected.");
      return;
    }

    setIsParsing(true);
    try {
      const text = await file.text();
      if (sequence !== parseSequenceRef.current) return;
      setParsed(parseCsv(text));
    } catch (error) {
      if (sequence !== parseSequenceRef.current) return;
      setFileError(
        error instanceof Error
          ? error.message
          : "The selected file could not be read.",
      );
    } finally {
      if (sequence === parseSequenceRef.current) setIsParsing(false);
    }
  }

  function removeFile() {
    parseSequenceRef.current += 1;
    setSelectedFile(null);
    setParsed(null);
    setFileError("");
    setResult(null);
    setIsParsing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleImport() {
    if (!selectedFile || !parsed || !category || !validation) return;
    setIsImporting(true);
    setResult(null);
    try {
      await Promise.resolve();
      const summary = commitImport(parsed, category, email, selectedFile.name);
      setResult({ type: "success", summary });
      setStorageVersion((version) => version + 1);
    } catch (error) {
      setResult({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "The import could not be completed.",
      });
    } finally {
      setIsImporting(false);
    }
  }

  const previewHeaders = parsed?.headers.slice(0, PREVIEW_COLUMN_LIMIT) ?? [];
  const previewRows = parsed?.rows.slice(0, PREVIEW_ROW_LIMIT) ?? [];
  const warningCount =
    (validation?.headerWarnings.length ?? 0) +
    (validation?.rows.reduce((count, row) => count + row.warnings.length, 0) ?? 0);
  const canImport =
    Boolean(selectedFile) &&
    Boolean(parsed) &&
    Boolean(category) &&
    !fileError &&
    !isParsing &&
    !isImporting &&
    Boolean(validation) &&
    validation.headerErrors.length === 0 &&
    !validation.storageError &&
    validation.importableCount > 0;

  return (
    <section className="edc-admin-data-import">
      <p className="edc-admin-data-import-note">
        CSV files are read in this browser and are not uploaded or saved as files. This is a localStorage demo import, not a production data migration.
      </p>

      <div className="edc-admin-panel edc-admin-import-source">
        <label className="edc-admin-import-field" htmlFor="edc-admin-import-category">
          Import category
          <select
            id="edc-admin-import-category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setResult(null);
            }}
          >
            <option value="">Choose a supported category</option>
            {IMPORT_CATEGORIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {category && (
          <p className="edc-admin-import-category-note">
            {IMPORT_CATEGORIES.find((item) => item.id === category)?.description}
          </p>
        )}

        <div className="edc-admin-import-file-row">
          <label className="edc-admin-export-button edc-admin-import-select" htmlFor="edc-admin-import-file">
            <FileUp size={15} aria-hidden="true" />
            Select CSV file
          </label>
          <input
            ref={fileInputRef}
            id="edc-admin-import-file"
            className="edc-admin-visually-hidden"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              if (file) selectFile(file);
            }}
          />
          {selectedFile && (
            <div className="edc-admin-import-file-meta">
              <strong title={selectedFile.name}>{selectedFile.name}</strong>
              <span>{formatFileSize(selectedFile.size)}</span>
            </div>
          )}
          {selectedFile && (
            <button
              className="edc-admin-import-remove"
              type="button"
              onClick={removeFile}
              disabled={isImporting}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Remove file
            </button>
          )}
        </div>
      </div>

      <div className="edc-admin-panel edc-admin-import-unavailable">
        <div className="edc-admin-import-section-title">
          <AlertTriangle size={17} aria-hidden="true" />
          <h3>Unavailable import categories</h3>
        </div>
        <ul>
          <li>
            <strong>Registered users and teacher applications:</strong> the current data model combines accounts and applications; CSV import cannot safely establish authentication credentials or preserve a supported application workflow.
          </li>
          <li>
            <strong>Admin Activity Log:</strong> importing historical actions could misrepresent events that did not occur in this browser.
          </li>
        </ul>
      </div>

      {fileError && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          {fileError}
        </p>
      )}
      {isParsing && (
        <p className="edc-admin-feedback" role="status">
          Reading and validating the selected CSV…
        </p>
      )}
      {validation?.storageError && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          {validation.storageError} Existing data was left unchanged.
        </p>
      )}
      {validation?.headerErrors.map((message) => (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert" key={message}>
          {message}
        </p>
      ))}
      {validation?.headerWarnings.map((message) => (
        <p className="edc-admin-import-warning" role="status" key={message}>
          {message}
        </p>
      ))}

      {parsed && category && validation && (
        <section className="edc-admin-panel edc-admin-import-preview">
          <div className="edc-admin-import-preview-heading">
            <div>
              <span className="edc-admin-page-eyebrow">VALIDATION PREVIEW</span>
              <h3>{IMPORT_CATEGORIES.find((item) => item.id === category)?.label}</h3>
            </div>
            <span className="edc-admin-import-row-total">
              {validation.totalRows} data row{validation.totalRows === 1 ? "" : "s"}
            </span>
          </div>

          <dl className="edc-admin-import-summary">
            <div><dt>Valid rows</dt><dd>{validation.validCount}</dd></div>
            <div><dt>Invalid rows</dt><dd>{validation.invalidCount}</dd></div>
            <div><dt>Duplicates</dt><dd>{validation.duplicateCount}</dd></div>
            <div><dt>Will be imported</dt><dd>{validation.importableCount}</dd></div>
          </dl>

          {warningCount > 0 && (
            <p className="edc-admin-import-warning" role="status">
              {warningCount} warning{warningCount === 1 ? "" : "s"}: unsupported columns will be ignored, and duplicate rows will be skipped.
            </p>
          )}

          {validation.rows.length > 0 && (
            <>
              <div className="edc-admin-import-table-wrap">
                <table className="edc-admin-import-table">
                  <thead>
                    <tr>
                      <th scope="col">CSV row</th>
                      {previewHeaders.map((header) => (
                        <th scope="col" key={header}>{header}</th>
                      ))}
                      {parsed.headers.length > PREVIEW_COLUMN_LIMIT && (
                        <th scope="col">Other columns</th>
                      )}
                      <th scope="col">Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => {
                      const rowValidation = validation.rows.find(
                        (item) => item.rowNumber === row.rowNumber,
                      );
                      return (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          {previewHeaders.map((header) => {
                            const index = parsed.headers.indexOf(header);
                            return (
                              <td key={`${row.rowNumber}-${header}`}>
                                {row.cells[index] ?? ""}
                              </td>
                            );
                          })}
                          {parsed.headers.length > PREVIEW_COLUMN_LIMIT && (
                            <td>+{parsed.headers.length - PREVIEW_COLUMN_LIMIT} columns</td>
                          )}
                          <td>
                            {rowValidation?.errors.map((message) => (
                              <span className="edc-admin-import-row-error" key={message}>
                                {message}
                              </span>
                            ))}
                            {rowValidation?.warnings.map((message) => (
                              <span className="edc-admin-import-row-warning" key={message}>
                                {message}
                              </span>
                            ))}
                            {!rowValidation?.errors.length &&
                              !rowValidation?.warnings.length &&
                              <span className="edc-admin-import-row-valid">Ready</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {validation.rows.length > PREVIEW_ROW_LIMIT && (
                <p className="edc-admin-import-preview-limit">
                  Showing the first {PREVIEW_ROW_LIMIT} of {validation.rows.length} rows.
                </p>
              )}
            </>
          )}
          {validation.totalRows === 0 && (
            <p className="edc-admin-import-warning" role="status">
              This CSV contains headers but no data rows.
            </p>
          )}

          <div className="edc-admin-import-confirm">
            <p>
              Review the summary above. Importing appends only valid, non-duplicate records; existing records are not overwritten.
            </p>
            <button
              className="edc-admin-export-button"
              type="button"
              disabled={!canImport}
              onClick={handleImport}
            >
              <Upload size={15} aria-hidden="true" />
              {isImporting
                ? "Importing…"
                : `Confirm and import ${validation.importableCount} record${validation.importableCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}

      {result?.type === "success" && (
        <p className="edc-admin-feedback edc-admin-feedback-success" role="status">
          Imported {result.summary.importedCount} record{result.summary.importedCount === 1 ? "" : "s"}. Skipped {result.summary.skippedCount} ({result.summary.invalidCount} invalid, {result.summary.duplicateCount} duplicate).
        </p>
      )}
      {result?.type === "error" && (
        <p className="edc-admin-feedback edc-admin-feedback-error" role="alert">
          {result.message}
        </p>
      )}
    </section>
  );
}

export default AdminDataImport;
