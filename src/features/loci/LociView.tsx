import { useEffect, useState, type FC } from "react";
import {
  Castle,
  HardDrive,
  Map as MapIcon,
  Moon,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import type { LociState, Palace, ReviewSession } from "../../lib/loci-types";
import { loadLociState, saveLociState } from "../../lib/loci-store";
import { PalaceLibrary } from "./PalaceLibrary";
import { RouteBuilder } from "./RouteBuilder";
import { ItemPlacement } from "./ItemPlacement";
import { WalkSession } from "./WalkSession";
import { RecallSession } from "./RecallSession";
import { ReviewDashboard } from "./ReviewDashboard";
import { LociSettingsView } from "./LociSettingsView";
import { PrecisionPalaceModal } from "./PrecisionPalaceModal";
import { CuratorDrawer } from "./CuratorDrawer";
import { CommandBar } from "./CommandBar";
import { Cpu, Terminal } from "lucide-react";
import { exportLociData } from "../../lib/loci-store";
import { curatorSettings } from "../../lib/curator-core";
import "../../workspace-loci.css";

interface Props {
  onFocusChange?: (inFocusScreen: boolean) => void;
}

type LociSubView =
  | "library"
  | "create-route"
  | "edit-route"
  | "place-items"
  | "walk"
  | "recall"
  | "review"
  | "settings";

export const LociView: FC<Props> = ({ onFocusChange }) => {
  const [state, setState] = useState<LociState>(loadLociState);
  const [activeView, setActiveView] = useState<LociSubView>("library");
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [reviewMode, setReviewMode] = useState<"first-walk" | "recall" | "reverse" | "random">("recall");
  const [precisionModalOpen, setPrecisionModalOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ palaceId?: string; itemId?: string } | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const cs = curatorSettings(state.settings);

  // Ctrl/⌘ K opens the command bar — never during a walk or recall, to protect the test.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      if (!cs.modules.commandBar || activeView === "walk" || activeView === "recall") return;
      e.preventDefault();
      setCommandOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cs.modules.commandBar, activeView]);

  /** Opens an editor with a draft palace. Nothing is saved until the user saves there. */
  const openEditor = (draft: Palace, view: "edit-route" | "place-items") => {
    setSelectedPalace(draft);
    setActiveView(view);
  };

  const handleExportAll = async () => {
    const json = await exportLociData(state, false);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `loci-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Apply theme according to Loci settings
  useEffect(() => {
    const applyTheme = (theme: "system" | "light" | "dark") => {
      if (theme === "system") {
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
    };

    applyTheme(state.settings.theme);

    if (state.settings.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [state.settings.theme]);

  // Notify parent if in full focus screen (Walk / Recall)
  useEffect(() => {
    const isFocus = activeView === "walk" || activeView === "recall";
    onFocusChange?.(isFocus);
  }, [activeView, onFocusChange]);

  const updateState = (updater: (prev: LociState) => LociState) => {
    setState((prev) => {
      const next = updater(prev);
      saveLociState(next);
      return next;
    });
  };

  const handleUpdatePalace = (updated: Palace) => {
    updateState((prev) => ({
      ...prev,
      palaces: prev.palaces.some((p) => p.id === updated.id)
        ? prev.palaces.map((p) => (p.id === updated.id ? updated : p))
        : [updated, ...prev.palaces], // drafts (e.g. templates) are first saved here, after approval
    }));
    setSelectedPalace(updated);
  };

  const handleDeletePalace = (palaceId: string) => {
    updateState((prev) => ({
      ...prev,
      palaces: prev.palaces.filter((p) => p.id !== palaceId),
      sessions: prev.sessions.filter((s) => s.palaceId !== palaceId),
    }));
    if (selectedPalace?.id === palaceId) {
      setSelectedPalace(null);
      setActiveView("library");
    }
  };

  const handleStartNewPalace = () => {
    const newPalace: Palace = {
      id: "palace_" + Math.random().toString(36).slice(2, 9),
      name: "",
      location: "",
      locationConfirmed: false,
      route: [],
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setSelectedPalace(newPalace);
    setActiveView("create-route");
  };

  const handleSaveRoute = (updated: Palace, proceedToItems: boolean) => {
    updateState((prev) => {
      const exists = prev.palaces.some((p) => p.id === updated.id);
      return {
        ...prev,
        palaces: exists
          ? prev.palaces.map((p) => (p.id === updated.id ? updated : p))
          : [...prev.palaces, updated],
      };
    });
    setSelectedPalace(updated);
    if (proceedToItems) {
      setActiveView("place-items");
    } else {
      setActiveView("library");
    }
  };

  const handleSaveAndWalk = (updated: Palace) => {
    handleUpdatePalace(updated);
    setActiveView("walk");
  };

  const handleFinishWalk = (startVerificationPass: boolean) => {
    if (startVerificationPass) {
      setReviewMode("first-walk");
      setActiveView("recall");
    } else {
      setActiveView("library");
    }
  };

  const handleCompleteRecall = (session: ReviewSession, updatedPalace: Palace) => {
    updateState((prev) => ({
      ...prev,
      palaces: prev.palaces.map((p) => (p.id === updatedPalace.id ? updatedPalace : p)),
      sessions: [session, ...prev.sessions],
    }));
    setSelectedPalace(updatedPalace);
  };

  const handleSplitPalace = (overflowItems: string[]) => {
    if (!selectedPalace) return;
    const splitPalace: Palace = {
      id: "palace_" + Math.random().toString(36).slice(2, 9),
      name: `${selectedPalace.name} (Part 2)`,
      location: "",
      locationConfirmed: false,
      route: [],
      items: overflowItems.map((text) => ({
        id: "item_" + Math.random().toString(36).slice(2, 9),
        locusId: "",
        text,
        imageCue: "",
        imageSource: "user",
        review: {
          ease: 2.5,
          intervalDays: 0,
          dueAt: new Date().toISOString(),
          reps: 0,
          lapses: 0,
        },
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateState((prev) => ({ ...prev, palaces: [...prev.palaces, splitPalace] }));
    setSelectedPalace(splitPalace);
    setActiveView("create-route");
  };

  const isFocusScreen = activeView === "walk" || activeView === "recall";

  return (
    <div
      className={`loci-scope min-h-[600px] ${
        state.settings.minimalMode ? "loci-minimal-mode" : ""
      } ${state.settings.textSize === "large" ? "text-lg" : "text-base"}`}
    >
      {/* Top Navigation Bar (Hidden during focus walk/recall) */}
      {!isFocusScreen && (
        <div className="border-b border-[var(--loci-border)] bg-[var(--loci-surface)] px-4 py-3 mb-6">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
            {/* Left: Section tabs */}
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Loci Navigation">
              <button
                type="button"
                role="tab"
                aria-selected={activeView === "library"}
                className={`loci-btn text-xs min-h-[38px] ${
                  activeView === "library" || activeView === "create-route" || activeView === "edit-route" || activeView === "place-items"
                    ? "loci-btn-primary"
                    : "loci-btn-ghost"
                }`}
                onClick={() => setActiveView("library")}
              >
                <Castle size={16} aria-hidden="true" />
                <span>Palaces</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeView === "review"}
                className={`loci-btn text-xs min-h-[38px] ${
                  activeView === "review" ? "loci-btn-primary" : "loci-btn-ghost"
                }`}
                onClick={() => setActiveView("review")}
              >
                <MapIcon size={16} aria-hidden="true" />
                <span>Review Dashboard</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeView === "settings"}
                className={`loci-btn text-xs min-h-[38px] ${
                  activeView === "settings" ? "loci-btn-primary" : "loci-btn-ghost"
                }`}
                onClick={() => setActiveView("settings")}
              >
                <Settings size={16} aria-hidden="true" />
                <span>Loci Settings</span>
              </button>
            </div>

            {/* Right: Quick actions & indicators */}
            <div className="flex items-center gap-2 text-xs text-[var(--loci-text-muted)]">
              <span className="hidden sm:inline-flex items-center gap-1" title="Stored locally on this device">
                <HardDrive size={14} className="text-[var(--loci-accent)]" aria-hidden="true" />
                <span>Saved locally</span>
              </span>

              <button
                type="button"
                className="loci-btn loci-btn-ghost min-h-[34px] px-2.5 text-xs"
                onClick={() => setDrawer({ palaceId: selectedPalace?.id })}
                title="Curator — proposes, you commit"
                aria-label="Open Curator"
              >
                <Cpu size={15} aria-hidden="true" />
                <span className="hidden sm:inline">Curator</span>
              </button>
              {cs.modules.commandBar && (
                <button
                  type="button"
                  className="loci-btn loci-btn-ghost min-h-[34px] px-2.5 text-xs"
                  onClick={() => setCommandOpen(true)}
                  title="Command bar (Ctrl/⌘ K)"
                  aria-label="Open command bar"
                >
                  <Terminal size={15} aria-hidden="true" />
                  <span className="hidden md:inline font-mono text-[10px] opacity-75">⌘K</span>
                </button>
              )}

              {/* Theme quick toggle */}
              <button
                type="button"
                className="p-1.5 rounded hover:bg-[var(--loci-surface-2)] text-[var(--loci-text)]"
                onClick={() => {
                  const nextTheme = state.settings.theme === "dark" ? "light" : "dark";
                  updateState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, theme: nextTheme },
                  }));
                }}
                title={`Current theme: ${state.settings.theme}. Click to toggle.`}
                aria-label="Toggle theme"
              >
                {state.settings.theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
              </button>

              {activeView === "library" && (
                <button
                  type="button"
                  className="loci-btn loci-btn-primary text-xs min-h-[34px] px-2.5 ml-2"
                  onClick={handleStartNewPalace}
                >
                  <Plus size={14} aria-hidden="true" />
                  <span>New palace</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="px-4 pb-12">
        {activeView === "library" && (
          <PalaceLibrary
            state={state}
            onSelectPalace={(palace, view) => {
              setSelectedPalace(palace);
              if (view === "recall") {
                setReviewMode("recall");
                setActiveView("recall");
              } else if (view === "walk") {
                setActiveView("walk");
              } else if (view === "edit-route") {
                setActiveView("edit-route");
              } else if (view === "place-items") {
                setActiveView("place-items");
              }
            }}
            onNewPalace={handleStartNewPalace}
            onUpdatePalace={handleUpdatePalace}
            onDeletePalace={handleDeletePalace}
            onOpenImport={() => {
              setActiveView("settings");
            }}
            onOpenPrecisionPresets={() => setPrecisionModalOpen(true)}
            onEvolvePalace={(p) => setDrawer({ palaceId: p.id })}
          />
        )}

        {(activeView === "create-route" || activeView === "edit-route") && selectedPalace && (
          <RouteBuilder
            palace={selectedPalace}
            onSave={handleSaveRoute}
            onCancel={() => setActiveView("library")}
          />
        )}

        {activeView === "place-items" && selectedPalace && (
          <ItemPlacement
            palace={selectedPalace}
            settings={state.settings}
            onSaveAndWalk={handleSaveAndWalk}
            onAddLoci={() => setActiveView("edit-route")}
            onSplitPalace={handleSplitPalace}
            onBack={() => setActiveView("edit-route")}
          />
        )}

        {activeView === "walk" && selectedPalace && (
          <WalkSession
            palace={selectedPalace}
            settings={state.settings}
            onFinishWalk={handleFinishWalk}
            onExit={() => setActiveView("library")}
          />
        )}

        {activeView === "recall" && selectedPalace && (
          <RecallSession
            palace={selectedPalace}
            settings={state.settings}
            mode={reviewMode}
            onComplete={handleCompleteRecall}
            onExit={() => setActiveView("library")}
          />
        )}

        {activeView === "review" && (
          <ReviewDashboard
            state={state}
            onStartReview={(palace, mode) => {
              setSelectedPalace(palace);
              setReviewMode(mode);
              setActiveView("recall");
            }}
            onSelectPalace={(palace, view) => {
              setSelectedPalace(palace);
              setActiveView(view);
            }}
            onEvolveItem={(palace, itemId) => setDrawer({ palaceId: palace.id, itemId })}
            onEvolvePalace={(palace) => setDrawer({ palaceId: palace.id })}
          />
        )}

        {activeView === "settings" && (
          <LociSettingsView
            state={state}
            onUpdateSettings={(settings) => updateState((prev) => ({ ...prev, settings }))}
            onStateReload={(newState) => setState(newState)}
            onThemeChange={(theme) => {
              if (theme === "system") {
                const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
              } else {
                document.documentElement.setAttribute("data-theme", theme);
              }
            }}
          />
        )}
      </div>

      {/* Precision Championship Palaces Modal */}
      {precisionModalOpen && (
        <PrecisionPalaceModal
          settings={state.settings}
          onDeployPalace={(newPalace) => {
            // Template cues arrive as unapproved drafts. Nothing is saved until every cue is approved.
            setSelectedPalace(newPalace);
            setActiveView("place-items");
          }}
          onClose={() => setPrecisionModalOpen(false)}
        />
      )}

      {/* Curator — advisory only. Proposes; the user commits. */}
      <CuratorDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        state={state}
        initialPalaceId={drawer?.palaceId}
        focusItemId={drawer?.itemId}
        onOpenEditor={(p, view) => {
          setDrawer(null);
          openEditor(p, view);
        }}
        onStartReview={(p) => {
          setDrawer(null);
          setSelectedPalace(p);
          setReviewMode("recall");
          setActiveView("recall");
        }}
      />
      <CommandBar
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        state={state}
        onStartReview={(p, mode) => {
          setCommandOpen(false);
          setSelectedPalace(p);
          setReviewMode(mode);
          setActiveView("recall");
        }}
        onOpenEditor={(p, view) => {
          setCommandOpen(false);
          openEditor(p, view);
        }}
        onExport={() => void handleExportAll()}
      />
    </div>
  );
};
