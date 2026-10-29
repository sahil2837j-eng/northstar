import { useEffect, useState, type FC } from "react";
import {
  BookOpen,
  Cpu,
  Download,
  HardDrive,
  Lock,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import type { LociSettings, LociState } from "../../lib/loci-types";
import { SettingsIllustration } from "../../components/loci/LociIllustrations";
import {
  DEFAULT_LOCI_SETTINGS,
  clearAllLociData,
  executeLociImport,
  exportLociData,
  previewLociImport,
  type ImportPreview,
} from "../../lib/loci-store";
import { getLociStorageUsage } from "../../lib/loci-db";
import { detectProvider, isLocalEndpoint, modelNames, modelsUrl } from "../../lib/mentor";
import { CuratorSettingsCard } from "./CuratorSettingsCard";
import RemoteAISettings from "../RemoteAISettings";

interface Props {
  state: LociState;
  onUpdateSettings: (settings: LociSettings) => void;
  onStateReload: (newState: LociState) => void;
  onThemeChange: (theme: "system" | "light" | "dark") => void;
}

export const LociSettingsView: FC<Props> = ({
  state,
  onUpdateSettings,
  onStateReload,
  onThemeChange,
}) => {
  const { settings } = state;
  const [storageUsage, setStorageUsage] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testingAi, setTestingAi] = useState(false);
  const [exportIncludeImages, setExportIncludeImages] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [deleteTypedText, setDeleteTypedText] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    getLociStorageUsage().then(setStorageUsage);
  }, []);

  const handleUpdate = (patch: Partial<LociSettings>) => {
    const updated = { ...settings, ...patch };
    onUpdateSettings(updated);
    if (patch.theme) {
      onThemeChange(patch.theme);
    }
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    setTestStatus(null);
    const endpoint = (settings.aiEndpoint || "/ollama").trim().replace(/\/+$/, "");

    // Network rule: only loopback endpoints or the same-origin proxy are ever contacted.
    if (!isLocalEndpoint(endpoint)) {
      setTestStatus(
        "Rejected: only loopback endpoints (localhost, 127.0.0.1, ::1) or the built-in /ollama proxy are allowed. No request was sent.",
      );
      setTestingAi(false);
      return;
    }

    const kind = detectProvider(endpoint);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(modelsUrl(endpoint, kind), {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const models = modelNames(data, kind);
        const wanted = settings.aiModel.trim();
        const hasModel = models.some((m) => m === wanted || m.startsWith(`${wanted}:`));
        const server = kind === "ollama" ? "Ollama" : "the OpenAI-compatible server";
        if (hasModel) {
          setTestStatus(`Connected to ${server}! Model "${wanted}" is ready.`);
        } else {
          setTestStatus(
            `Connected to ${server}, but model "${wanted}" was not found. Available models: ${models.join(", ") || "none"}.`,
          );
        }
      } else {
        setTestStatus(`Endpoint responded with status ${res.status}.`);
      }
    } catch {
      setTestStatus(
        "Could not connect. Start Ollama (default http://127.0.0.1:11434) and open the app through `npm start` so /ollama is proxied, or point this at an OpenAI-compatible local server such as LM Studio on http://127.0.0.1:1234/v1.",
      );
    } finally {
      setTestingAi(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const json = await exportLociData(state, exportIncludeImages);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `loci-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const preview = previewLociImport(content);
      setImportPreview(preview);
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async (mode: "merge" | "replace") => {
    if (!importPreview || !importPreview.valid) return;
    try {
      const nextState = await executeLociImport(importPreview, mode, state);
      onStateReload(nextState);
      setImportPreview(null);
      getLociStorageUsage().then(setStorageUsage);
    } catch {
      // error handled
    }
  };

  const handleDeleteAll = async () => {
    if (deleteTypedText.trim().toLowerCase() === "delete all loci") {
      await clearAllLociData();
      setShowDeleteModal(false);
      setDeleteTypedText("");
      onStateReload({
        version: 1,
        palaces: [],
        sessions: [],
        settings: DEFAULT_LOCI_SETTINGS,
      });
      setStorageUsage({ count: 0, bytes: 0 });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 KB";
    const k = 1024;
    const dm = 1;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="loci-card text-center py-6">
        <SettingsIllustration />
        <h1 className="text-2xl font-bold tracking-tight mb-1 text-[var(--loci-text)]">
          Loci Settings &amp; Data
        </h1>
        <p className="text-sm text-[var(--loci-text-muted)] max-w-lg mx-auto">
          Manage appearance, aphantasia verbal mode, local AI connection, and local data export/import.
        </p>
      </div>

      {/* Appearance Section */}
      <div className="loci-card space-y-5">
        <h2 className="text-base font-bold flex items-center gap-2 border-b border-[var(--loci-border)] pb-3">
          <Palette size={18} className="text-[var(--loci-accent)]" aria-hidden="true" />
          <span>Appearance &amp; Theme</span>
        </h2>

        {/* Theme Picker */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[var(--loci-text)]">
            Theme Mode (WCAG AA High Contrast)
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              className={`loci-btn ${settings.theme === "system" ? "loci-btn-primary" : ""}`}
              onClick={() => handleUpdate({ theme: "system" })}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>System (Auto)</span>
            </button>
            <button
              type="button"
              className={`loci-btn ${settings.theme === "light" ? "loci-btn-primary" : ""}`}
              onClick={() => handleUpdate({ theme: "light" })}
            >
              <Sun size={14} aria-hidden="true" />
              <span>Light Theme</span>
            </button>
            <button
              type="button"
              className={`loci-btn ${settings.theme === "dark" ? "loci-btn-primary" : ""}`}
              onClick={() => handleUpdate({ theme: "dark" })}
            >
              <Moon size={14} aria-hidden="true" />
              <span>Dark Theme</span>
            </button>
          </div>
        </div>

        {/* Visual Toggles */}
        <div className="space-y-3 pt-2 text-xs">
          <label className="flex items-center justify-between p-3 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] cursor-pointer">
            <div>
              <strong className="block text-[var(--loci-text)]">Reduced Motion</strong>
              <span className="text-[var(--loci-text-muted)]">Disables card flips, path animations, and smooth sliding transitions.</span>
            </div>
            <input
              type="checkbox"
              className="accent-[var(--loci-accent)] scale-125"
              checked={settings.reducedMotion}
              onChange={(e) => handleUpdate({ reducedMotion: e.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] cursor-pointer">
            <div>
              <strong className="block text-[var(--loci-text)]">Minimal Mode (Hide Illustrations)</strong>
              <span className="text-[var(--loci-text-muted)]">Hides decorative section illustrations for an ultra-compact field notebook look.</span>
            </div>
            <input
              type="checkbox"
              className="accent-[var(--loci-accent)] scale-125"
              checked={settings.minimalMode}
              onChange={(e) => handleUpdate({ minimalMode: e.target.checked })}
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] cursor-pointer">
            <div>
              <strong className="block text-[var(--loci-text)]">Text Size</strong>
              <span className="text-[var(--loci-text-muted)]">Adjust base font size scale.</span>
            </div>
            <select
              aria-label="Text size"
              className="p-1.5 rounded border border-[var(--loci-border)] bg-[var(--loci-surface)] text-[var(--loci-text)] text-xs"
              value={settings.textSize}
              onChange={(e) => handleUpdate({ textSize: e.target.value as any })}
            >
              <option value="standard">Standard (16px)</option>
              <option value="large">Large (18px)</option>
            </select>
          </label>
        </div>
      </div>

      {/* Learning & Accessibility Section */}
      <div className="loci-card space-y-4">
        <h2 className="text-base font-bold flex items-center gap-2 border-b border-[var(--loci-border)] pb-3">
          <BookOpen size={18} className="text-[var(--loci-accent)]" aria-hidden="true" />
          <span>Aphantasia &amp; Story Mode</span>
        </h2>

        <label className="flex items-start justify-between gap-3 p-3 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] cursor-pointer">
          <div className="text-xs space-y-1">
            <strong className="block text-[var(--loci-text)]">Verbal / Story Mode (Aphantasia-Friendly)</strong>
            <p className="text-[var(--loci-text-muted)] leading-relaxed">
              If you do not experience voluntary visual imagery (aphantasia), spatial recall still works via semantic and physical storytelling.
              This mode replaces "Picture it" prompts with narrative phrasing ("Trace the story in this spot"), reduces photo emphasis,
              and generates narrative cues based on action and physical touch.
            </p>
          </div>
          <input
            type="checkbox"
            className="mt-1 accent-[var(--loci-accent)] scale-125"
            checked={settings.verbalMode}
            onChange={(e) => handleUpdate({ verbalMode: e.target.checked })}
          />
        </label>
      </div>

      {/* Local AI Integration (Ollama) */}
      <div className="loci-card space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--loci-border)] pb-3">
          <div className="flex items-center gap-2">
            <Cpu size={18} className={settings.aiEnabled ? "text-[var(--loci-accent)]" : "text-[var(--loci-text-muted)]"} aria-hidden="true" />
            <h2 className="text-base font-bold text-[var(--loci-text)]">
              Local AI Cue Assistant
            </h2>
          </div>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[var(--loci-surface-2)] text-[var(--loci-text-muted)] border border-[var(--loci-border)]">
            {settings.aiEnabled ? "On · local default" : "Off"}
          </span>
        </div>

        <p className="text-xs text-[var(--loci-text-muted)] leading-relaxed">
          Local by default. Connects to Ollama through the built-in <code className="mono">/ollama</code> proxy,
          or to an OpenAI-compatible server on this machine. You always review, edit, and approve every cue before it
          is anchored. The optional remote API is controlled below and in main Settings; turning it on is the only
          way a cue request leaves this machine.
        </p>

        <label className="flex items-center gap-3 p-3 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] cursor-pointer text-xs">
          <input
            type="checkbox"
            className="accent-[var(--loci-accent)] scale-125"
            checked={settings.aiEnabled}
            onChange={(e) => handleUpdate({ aiEnabled: e.target.checked })}
          />
          <span className="font-semibold text-[var(--loci-text)]">
            Enable local AI suggestions in cue editor
          </span>
        </label>

        {settings.aiEnabled && (
          <div className="space-y-3 pt-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ai-endpoint" className="block font-medium mb-1">Local AI endpoint</label>
                <input
                  type="text"
                  className="w-full p-2 rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)]"
                  id="ai-endpoint"
                  value={settings.aiEndpoint}
                  onChange={(e) => handleUpdate({ aiEndpoint: e.target.value })}
                  placeholder="/ollama  ·  http://127.0.0.1:1234/v1"
                />
              </div>
              <div>
                <label htmlFor="ai-model" className="block font-medium mb-1">Model name</label>
                <input
                  type="text"
                  className="w-full p-2 rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)]"
                  id="ai-model"
                  value={settings.aiModel}
                  onChange={(e) => handleUpdate({ aiModel: e.target.value })}
                  placeholder="qwen2.5:7b-instruct"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                className="loci-btn text-xs min-h-[36px]"
                disabled={testingAi}
                onClick={handleTestAi}
              >
                <Cpu size={14} aria-hidden="true" />
                <span>{testingAi ? "Testing connection..." : "Test local AI connection"}</span>
              </button>
            </div>

            {testStatus && (
              <div
                className={`p-3 rounded-lg border text-xs leading-relaxed ${
                  testStatus.includes("Connected")
                    ? "border-[var(--loci-success)] bg-[rgba(46,125,79,0.1)] text-[var(--loci-success)]"
                    : "border-[var(--loci-warn)] bg-[rgba(224,164,74,0.1)] text-[var(--loci-warn)]"
                }`}
              >
                {testStatus}
              </div>
            )}
          </div>
        )}
      </div>

      <RemoteAISettings compact />

      <CuratorSettingsCard settings={settings} testStatus={testStatus} onChange={handleUpdate} />

      {/* Local Storage & Export / Import */}
      <div className="loci-card space-y-5">
        <h2 className="text-base font-bold flex items-center gap-2 border-b border-[var(--loci-border)] pb-3">
          <HardDrive size={18} className="text-[var(--loci-accent)]" aria-hidden="true" />
          <span>Local Device Storage &amp; Backup</span>
        </h2>

        <div className="p-3 rounded-lg bg-[var(--loci-surface-2)] border border-[var(--loci-border)] text-xs flex items-center justify-between">
          <span>Photos stored in IndexedDB:</span>
          <span className="font-mono font-bold text-[var(--loci-text)]">
            {storageUsage.count} photos ({formatBytes(storageUsage.bytes)})
          </span>
        </div>

        {/* Export */}
        <div className="space-y-3 pt-2 text-xs">
          <strong className="block text-sm text-[var(--loci-text)]">Export Data (JSON)</strong>
          <p className="text-[var(--loci-text-muted)]">
            Download your memory palaces, routes, items, and SM-2 review progress as a versioned JSON file.
          </p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-[var(--loci-accent)]"
              checked={exportIncludeImages}
              onChange={(e) => setExportIncludeImages(e.target.checked)}
            />
            <span>Include attached photos (embedded as Base64 — larger file size)</span>
          </label>

          <button
            type="button"
            className="loci-btn loci-btn-primary text-xs"
            disabled={isExporting}
            onClick={handleExport}
          >
            <Download size={14} aria-hidden="true" />
            <span>{isExporting ? "Generating export..." : "Download Loci Backup"}</span>
          </button>
        </div>

        {/* Import */}
        <div className="space-y-3 pt-4 border-t border-[var(--loci-border)] text-xs">
          <strong className="block text-sm text-[var(--loci-text)]">Import Backup</strong>
          <p className="text-[var(--loci-text-muted)]">
            Import a previously exported Loci backup file. You will preview the contents and choose whether to merge or replace.
          </p>

          <label className="loci-btn text-xs cursor-pointer inline-flex items-center gap-2">
            <Upload size={14} aria-hidden="true" />
            <span>Select backup file</span>
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
              }}
            />
          </label>
        </div>

        {/* Delete All Data */}
        <div className="pt-6 border-t border-[var(--loci-border)]">
          <button
            type="button"
            className="loci-btn loci-btn-danger text-xs"
            onClick={() => setShowDeleteModal(true)}
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Delete all Loci data...</span>
          </button>
        </div>
      </div>

      {/* Privacy Guarantee Banner (Section 9) */}
      <div className="p-4 rounded-xl border border-[var(--loci-border)] bg-[var(--loci-surface)] text-xs text-[var(--loci-text-muted)] flex items-start gap-3">
        <Lock size={16} className="text-[var(--loci-accent)] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong>Privacy Guarantee:</strong> Everything is stored locally on this device in localStorage and IndexedDB.
          There are no accounts, cloud sync, tracking scripts, or remote network calls.
        </p>
      </div>

      {/* Import Preview Modal (Section 9: Never overwrite silently) */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="import-preview-title">
          <div className="loci-card max-w-md w-full space-y-4">
            <h3 id="import-preview-title" className="text-lg font-bold">Import Backup Preview</h3>

            {!importPreview.valid ? (
              <div className="p-3 rounded bg-[rgba(240,113,103,0.12)] border border-[var(--loci-danger)] text-xs text-[var(--loci-danger)]">
                {importPreview.error}
              </div>
            ) : (
              <div className="space-y-3 text-xs text-[var(--loci-text)]">
                <p>Found valid Loci v1 backup:</p>
                <div className="p-3 rounded bg-[var(--loci-surface-2)] border border-[var(--loci-border)] space-y-1 font-mono text-[11px]">
                  <div>Palaces: <strong>{importPreview.palaceCount}</strong> ({importPreview.palaceNames.join(", ")})</div>
                  <div>Total loci spots: <strong>{importPreview.totalSpots}</strong></div>
                  <div>Total placed items: <strong>{importPreview.totalItems}</strong></div>
                  <div>Embedded photos: <strong>{importPreview.imageCount}</strong></div>
                </div>
                {importPreview.repairNote && (
                  <div className="curator-guard space-y-1">
                    <p>
                      <strong>This backup needed repairs.</strong> It was read, but parts did not match the
                      expected shape and were corrected so they cannot break the app:
                    </p>
                    <p className="text-[var(--loci-text-muted)]">{importPreview.repairNote}</p>
                    <p className="text-[var(--loci-text-muted)]">
                      The counts above are what will actually be imported.
                    </p>
                  </div>
                )}
                <p className="text-[var(--loci-text-muted)]">
                  Choose how you want to apply this import:
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                className="loci-btn loci-btn-ghost text-xs"
                onClick={() => setImportPreview(null)}
              >
                Cancel
              </button>

              {importPreview.valid && (
                <>
                  <button
                    type="button"
                    className="loci-btn text-xs"
                    onClick={() => handleExecuteImport("merge")}
                  >
                    Merge with existing
                  </button>
                  <button
                    type="button"
                    className="loci-btn loci-btn-primary text-xs"
                    onClick={() => handleExecuteImport("replace")}
                  >
                    Replace all palaces
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete All Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-all-title">
          <div className="loci-card max-w-md w-full space-y-4 border-[var(--loci-danger)]">
            <h3 id="delete-all-title" className="text-lg font-bold text-[var(--loci-danger)] flex items-center gap-2">
              <Trash2 size={20} aria-hidden="true" />
              <span>Delete All Loci Palaces</span>
            </h3>
            <p className="text-xs text-[var(--loci-text-muted)] leading-relaxed">
              This will permanently delete all memory palaces, placed items, review sessions, and photo blobs stored in IndexedDB.
              This action cannot be undone.
            </p>

            <div className="space-y-1.5 pt-2 text-xs">
              <label htmlFor="delete-all-confirm" className="block font-medium">Type <strong>delete all loci</strong> to confirm:</label>
              <input
                type="text"
                className="w-full p-2.5 rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] focus:outline-none focus:border-[var(--loci-danger)] text-sm"
                placeholder="delete all loci"
                id="delete-all-confirm"
                value={deleteTypedText}
                onChange={(e) => setDeleteTypedText(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="loci-btn loci-btn-ghost text-xs"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTypedText("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="loci-btn loci-btn-danger text-xs"
                disabled={deleteTypedText.trim().toLowerCase() !== "delete all loci"}
                onClick={handleDeleteAll}
              >
                Confirm Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
