import { useCallback, useEffect, useRef, useState } from "react";
import {
  apiErrorMessage,
  deleteFile,
  downloadFileUrl,
  listFiles,
  uploadFile,
} from "../api/client";
import type { FileInfo } from "../types";
import MergeDialog from "./MergeDialog";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileManager({
  onOpen,
}: {
  onOpen: (file: FileInfo) => void;
}) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMerge, setShowMerge] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setFiles(await listFiles());
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        await uploadFile(file);
      }
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("Delete this file permanently?")) return;
    try {
      await deleteFile(fileId);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  const toggleSelect = (fileId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const selectedFiles = files.filter((f) => selected.has(f.file_id));

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div
        className={`dropzone${dragOver ? " dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        style={{ cursor: "pointer" }}
      >
        {busy ? "Uploading..." : "Drag & drop a .parquet/.geoparquet file here, or click to choose"}
        <input
          ref={inputRef}
          type="file"
          accept=".parquet,.geoparquet"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="toolbar">
        <span className="badge">files selected: {selected.size}</span>
        <div className="spacer" />
        <button
          className="secondary"
          disabled={selected.size < 2}
          onClick={() => setShowMerge(true)}
        >
          Merge selected
        </button>
      </div>

      <table className="file-list">
        <thead>
          <tr>
            <th></th>
            <th>Filename</th>
            <th>Type</th>
            <th>Size</th>
            <th>Rows</th>
            <th>Columns</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr key={f.file_id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(f.file_id)}
                  onChange={() => toggleSelect(f.file_id)}
                />
              </td>
              <td>{f.filename}</td>
              <td>
                {f.is_geo ? (
                  <span className="badge">geoparquet</span>
                ) : (
                  <span className="badge">parquet</span>
                )}
              </td>
              <td>{formatSize(f.size_bytes)}</td>
              <td>{f.row_count ?? "-"}</td>
              <td>{f.column_count ?? "-"}</td>
              <td style={{ display: "flex", gap: 6 }}>
                <button onClick={() => onOpen(f)}>Open</button>
                <a href={downloadFileUrl(f.file_id)}>
                  <button className="secondary">Download</button>
                </a>
                <button className="danger" onClick={() => handleDelete(f.file_id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {files.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: "#9aa4b2" }}>
                No files uploaded
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showMerge && (
        <MergeDialog
          files={selectedFiles}
          onClose={() => setShowMerge(false)}
          onDone={() => {
            setShowMerge(false);
            setSelected(new Set());
            refresh();
          }}
        />
      )}
    </div>
  );
}
