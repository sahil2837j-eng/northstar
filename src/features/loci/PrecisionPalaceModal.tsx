import { useState, type FC } from "react";
import {
  Check,
  Compass,
  MapPin,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import type { LociSettings, Palace } from "../../lib/loci-types";
import {
  PRECISION_PRESETS,
  instantiatePresetPalace,
  type PrecisionPreset,
} from "../../lib/loci-presets";
import { suggestImageCue } from "../../lib/loci-algorithms";

interface Props {
  settings: LociSettings;
  onDeployPalace: (newPalace: Palace) => void;
  onClose: () => void;
}

export const PrecisionPalaceModal: FC<Props> = ({
  settings,
  onDeployPalace,
  onClose,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<PrecisionPreset>(PRECISION_PRESETS[0]);
  const [userLocation, setUserLocation] = useState(PRECISION_PRESETS[0].locationDefault);
  const [confirmedWalkable, setConfirmedWalkable] = useState(false);
  const [activeTab, setActiveTab] = useState<"presets" | "synthesizer">("presets");

  // Custom Topic Synthesizer State
  const [customTopic, setCustomTopic] = useState("");
  const [customItemsRaw, setCustomItemsRaw] = useState("");
  const [customPalaceName, setCustomPalaceName] = useState("");
  const [customLocation, setCustomLocation] = useState("My Home or Daily Walking Route");
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesizedResult, setSynthesizedResult] = useState<Palace | null>(null);

  const handleSelectPreset = (preset: PrecisionPreset) => {
    setSelectedPreset(preset);
    setUserLocation(preset.locationDefault);
    setConfirmedWalkable(false);
  };

  const handleDeployPreset = () => {
    if (!confirmedWalkable) return;
    const palace = instantiatePresetPalace(selectedPreset, userLocation);
    onDeployPalace(palace);
    onClose();
  };

  // Synthesizes a precision palace for any custom topic using local AI or deterministic championship rules
  const handleSynthesizeCustom = async () => {
    if (!customTopic.trim()) return;

    setSynthesizing(true);
    setSynthesizedResult(null);

    const items = customItemsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const targetItems = items.length >= 5 ? items.slice(0, 15) : [
      `${customTopic} Principle 1`,
      `${customTopic} Principle 2`,
      `${customTopic} Principle 3`,
      `${customTopic} Principle 4`,
      `${customTopic} Principle 5`,
      `${customTopic} Principle 6`,
      `${customTopic} Principle 7`,
    ];

    const lociBase = [
      { spot: "Entrance doorway", landmark: "Heavy brass threshold & doorknob", sense: "Cold brass metal and drafty air" },
      { spot: "Foyer coat rack", landmark: "Antler wooden hooks", sense: "Scent of cedar wood and wool" },
      { spot: "Living room fireplace", landmark: "Cast-iron crackling hearth grate", sense: "Warm crackling pine smoke and glowing ash" },
      { spot: "Dining room center table", landmark: "Polished mahogany table surface", sense: "Slick polished wax and reflection of light" },
      { spot: "Kitchen counter island", landmark: "Black marble slab with cold veins", sense: "Icy stone touch and faint coffee aroma" },
      { spot: "Stove range hood", landmark: "Stainless steel exhaust hood", sense: "Humming fan vibration and warm metallic smell" },
      { spot: "Pantry double doors", landmark: "Frosted glass magnetic latch", sense: "Click of magnetic seal and cinnamon aroma" },
      { spot: "Backyard patio door", landmark: "Sliding bronze lock handle", sense: "Cool outdoor evening breeze" },
      { spot: "Garden stone bench", landmark: "Weathered gray granite slab", sense: "Rough damp stone texture" },
      { spot: "Garden birdbath center", landmark: "Carved stone water pedestal", sense: "Rippling water droplets and wet moss" },
    ];

    const generatedLoci = lociBase.slice(0, targetItems.length).map((base, idx) => ({
      id: `loc_syn_${idx + 1}`,
      order: idx + 1,
      spot: base.spot,
      landmark: base.landmark,
      sense: base.sense,
    }));

    const palaceId = "palace_syn_" + Math.random().toString(36).slice(2, 9);

    // Generate high-potency cues
    const generatedItems = await Promise.all(
      targetItems.map(async (text, idx) => {
        const locus = generatedLoci[idx];
        let cue = "";
        if (settings.aiEnabled) {
          try {
            cue = await suggestImageCue({
              item: text,
              spot: locus.spot,
              landmark: locus.landmark,
              sense: locus.sense,
              verbalMode: settings.verbalMode,
              aiEndpoint: settings.aiEndpoint,
              aiModel: settings.aiModel,
            });
          } catch {
            // fallback
          }
        }
        if (!cue) {
          cue = `A colossal, glowing ${text} violently crashes into the ${locus.landmark}, sparking with ${locus.sense}!`;
        }

        return {
          id: `item_syn_${idx + 1}`,
          locusId: locus.id,
          text,
          imageCue: cue,
          imageSource: "ai-edited" as const,
          cueApproved: false,
          review: {
            ease: 2.5,
            intervalDays: 0,
            dueAt: new Date().toISOString(),
            reps: 0,
            lapses: 0,
          },
          needsReencode: false,
        };
      }),
    );

    const finalPalace: Palace = {
      id: palaceId,
      name: customPalaceName.trim() || `${customTopic} Palace`,
      location: customLocation.trim(),
      locationConfirmed: true,
      route: generatedLoci,
      items: generatedItems,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSynthesizing(false);
    setSynthesizedResult(finalPalace);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="precision-modal-title"
    >
      <div className="loci-card max-w-4xl w-full max-h-[90vh] overflow-y-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--loci-border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[rgba(163,150,255,0.15)] border border-[var(--loci-accent)] text-[var(--loci-accent)] flex items-center justify-center shrink-0">
              <Zap size={22} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="precision-modal-title" className="text-xl font-bold text-[var(--loci-text)]">
                  Championship Precision Palaces
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[rgba(240,181,106,0.15)] text-[var(--loci-warn)] border border-[var(--loci-warn)]">
                  Drafts — you approve every cue
                </span>
              </div>
              <p className="text-xs text-[var(--loci-text-muted)] mt-0.5">
                Starting routes with distinct landmarks and sensory details. Template cues arrive as unapproved drafts —
                rewrite them in your own words or approve them one by one before the first walk.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="p-1.5 rounded text-[var(--loci-text-muted)] hover:text-[var(--loci-text)]"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-2 border-b border-[var(--loci-border)] pb-3">
          <button
            type="button"
            className={`loci-btn text-xs min-h-[36px] ${activeTab === "presets" ? "loci-btn-primary" : "loci-btn-ghost"}`}
            onClick={() => setActiveTab("presets")}
          >
            <Compass size={14} aria-hidden="true" />
            <span>Master Championship Presets ({PRECISION_PRESETS.length})</span>
          </button>
          <button
            type="button"
            className={`loci-btn text-xs min-h-[36px] ${activeTab === "synthesizer" ? "loci-btn-primary" : "loci-btn-ghost"}`}
            onClick={() => setActiveTab("synthesizer")}
          >
            <Wand2 size={14} aria-hidden="true" />
            <span>Topic AI Synthesizer (Any Subject)</span>
          </button>
        </div>

        {/* TAB 1: Championship Presets */}
        {activeTab === "presets" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Presets Sidebar List */}
            <div className="md:col-span-5 space-y-2 border-b md:border-b-0 md:border-r border-[var(--loci-border)] pb-4 md:pb-0 md:pr-4">
              <span className="text-xs font-bold text-[var(--loci-text-muted)] uppercase tracking-wider block mb-2">
                Select Master Palace:
              </span>

              {PRECISION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs space-y-1 block ${
                    selectedPreset.id === preset.id
                      ? "border-[var(--loci-accent)] bg-[var(--loci-surface-2)] shadow-sm"
                      : "border-[var(--loci-border)] hover:border-[var(--loci-border-focus)] bg-[var(--loci-surface)]"
                  }`}
                  onClick={() => handleSelectPreset(preset)}
                >
                  <div className="flex items-center justify-between">
                    <strong className="text-sm font-bold text-[var(--loci-text)]">{preset.name}</strong>
                    <span className="font-mono text-[10px] text-[var(--loci-accent)] font-semibold">
                      {preset.lociCount} loci
                    </span>
                  </div>
                  <p className="text-[var(--loci-text-muted)] line-clamp-1">{preset.subtitle}</p>
                </button>
              ))}
            </div>

            {/* Preset Inspector & Location Mapping */}
            <div className="md:col-span-7 space-y-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--loci-accent)] font-bold">
                  {selectedPreset.category.toUpperCase()} MASTER ROUTE
                </span>
                <h3 className="text-lg font-bold text-[var(--loci-text)] mt-0.5">
                  {selectedPreset.name}
                </h3>
                <p className="text-xs text-[var(--loci-text-muted)] mt-1 leading-relaxed">
                  {selectedPreset.description}
                </p>
              </div>

              {/* Loci and Cues Preview */}
              <div className="space-y-2 max-h-56 overflow-y-auto p-2 rounded-lg bg-[var(--loci-surface-2)] border border-[var(--loci-border)]">
                <span className="text-[11px] font-semibold text-[var(--loci-text-muted)] block mb-1">
                  Route Loci &amp; Anchors Preview:
                </span>
                {selectedPreset.route.map((locus, i) => (
                  <div key={i} className="text-xs p-2 rounded bg-[var(--loci-surface)] border border-[var(--loci-border)] flex items-start gap-2">
                    <span className="font-mono font-bold text-[var(--loci-accent)] shrink-0">#{locus.order}</span>
                    <div className="min-w-0">
                      <strong className="text-[var(--loci-text)]">{locus.spot}</strong>
                      <span className="text-[var(--loci-text-muted)] block">Landmark: {locus.landmark}</span>
                      {selectedPreset.defaultItems[i] && (
                        <p className="text-[var(--loci-accent)] text-[11px] italic mt-0.5">
                          Anchor: "{selectedPreset.defaultItems[i].text}" — {selectedPreset.defaultItems[i].imageCue}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Location Confirmation (Section 1 Non-negotiable Rule) */}
              <div className="p-4 rounded-xl border-2 border-[var(--loci-accent)] bg-[var(--loci-surface-2)] space-y-3 text-xs">
                <label htmlFor="preset-location" className="block font-semibold text-[var(--loci-text)]">
                  {selectedPreset.locationPrompt}
                </label>
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-[var(--loci-accent)] shrink-0" aria-hidden="true" />
                  <input
                    id="preset-location"
                    type="text"
                    className="flex-1 p-2 rounded border border-[var(--loci-border)] bg-[var(--loci-surface)] text-[var(--loci-text)] text-xs focus:outline-none focus:border-[var(--loci-focus)]"
                    value={userLocation}
                    onChange={(e) => setUserLocation(e.target.value)}
                    placeholder="e.g. My apartment, Childhood home, Downtown walk"
                  />
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[var(--loci-accent)] scale-125"
                    checked={confirmedWalkable}
                    onChange={(e) => setConfirmedWalkable(e.target.checked)}
                  />
                  <span className="text-[var(--loci-text)] leading-relaxed">
                    <strong>I can walk this route in my mind.</strong> I confirm these spots map to a real sequence I know intimately.
                  </span>
                </label>
              </div>

              {/* Deploy button */}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="loci-btn loci-btn-ghost text-xs" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="loci-btn loci-btn-primary text-xs"
                  disabled={!confirmedWalkable || !userLocation.trim()}
                  onClick={handleDeployPreset}
                >
                  <Zap size={14} aria-hidden="true" />
                  <span>Review &amp; approve cues ({selectedPreset.lociCount} spots)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Custom Topic Synthesizer */}
        {activeTab === "synthesizer" && (
          <div className="space-y-4 text-xs">
            <p className="text-[var(--loci-text-muted)] leading-relaxed">
              Enter any subject or paste your item list. The Synthesizer calibrates a custom 5–15 spot route with visceral, multi-sensory physical interaction cues.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="synth-topic" className="block font-semibold text-[var(--loci-text)] mb-1">
                  Topic or subject to memorise *
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] text-sm focus:outline-none focus:border-[var(--loci-focus)]"
                  placeholder="e.g. Constitutional Amendments, Docker Commands, French Vocab"
                  id="synth-topic"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="synth-name" className="block font-semibold text-[var(--loci-text)] mb-1">
                  Palace name (optional)
                </label>
                <input
                  type="text"
                  className="w-full p-2.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] text-sm focus:outline-none focus:border-[var(--loci-focus)]"
                  placeholder="e.g. Cloud Architecture Citadel"
                  id="synth-name"
                  value={customPalaceName}
                  onChange={(e) => setCustomPalaceName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="synth-location" className="block font-semibold text-[var(--loci-text)] mb-1">
                Familiar real location you can walk in your mind *
              </label>
              <input
                type="text"
                className="w-full p-2.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] text-sm focus:outline-none focus:border-[var(--loci-focus)]"
                placeholder="e.g. My apartment, University campus, Walk to the coffee shop"
                id="synth-location"
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="synth-items" className="block font-semibold text-[var(--loci-text)] mb-1">
                Specific items to memorise (optional, one per line)
              </label>
              <textarea
                rows={4}
                className="w-full p-2.5 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)] text-xs focus:outline-none focus:border-[var(--loci-focus)]"
                placeholder="Enter 5 to 15 items on separate lines..."
                id="synth-items"
                value={customItemsRaw}
                onChange={(e) => setCustomItemsRaw(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="loci-btn loci-btn-primary text-xs"
                disabled={synthesizing || !customTopic.trim() || !customLocation.trim()}
                onClick={handleSynthesizeCustom}
              >
                <Wand2 size={14} aria-hidden="true" />
                <span>{synthesizing ? "Synthesizing precision palace..." : "Synthesize precision palace"}</span>
              </button>
            </div>

            {/* Synthesized Preview & Deploy */}
            {synthesizedResult && (
              <div className="p-4 rounded-xl border-2 border-[var(--loci-success)] bg-[var(--loci-surface-2)] space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-sm text-[var(--loci-text)]">{synthesizedResult.name}</strong>
                    <span className="block text-[var(--loci-text-muted)] text-[11px]">
                      Mapped to {synthesizedResult.location} ({synthesizedResult.route.length} loci spots)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="loci-btn loci-btn-primary text-xs"
                    onClick={() => {
                      onDeployPalace(synthesizedResult);
                      onClose();
                    }}
                  >
                    <Check size={14} aria-hidden="true" />
                    <span>Review &amp; approve cues</span>
                  </button>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto p-2 rounded bg-[var(--loci-surface)] border border-[var(--loci-border)]">
                  {synthesizedResult.items.map((it, idx) => {
                    const loc = synthesizedResult.route[idx];
                    return (
                      <div key={it.id} className="text-[11px] p-1.5 border-b border-[var(--loci-border)] last:border-0">
                        <strong>Spot #{idx + 1} ({loc?.spot}):</strong> "{it.text}" — <span className="italic text-[var(--loci-accent)]">{it.imageCue}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
