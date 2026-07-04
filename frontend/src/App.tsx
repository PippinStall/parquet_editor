import { useState } from "react";
import Editor from "./components/Editor";
import FileManager from "./components/FileManager";
import { ToastProvider } from "./components/Toast";
import type { FileInfo } from "./types";

export default function App() {
  const [openFile, setOpenFile] = useState<FileInfo | null>(null);

  return (
    <ToastProvider>
      <header className="app-header">
        <h1>Parquet / GeoParquet Editor</h1>
      </header>
      <main>
        {openFile ? (
          <Editor file={openFile} onClose={() => setOpenFile(null)} />
        ) : (
          <FileManager onOpen={setOpenFile} />
        )}
      </main>
    </ToastProvider>
  );
}
