import { useState, type FC } from "react";
import {
  AlertTriangle,
  Brain,
  CalendarClock,
  CheckCircle2,
  Compass,
  Edit3,
  MapPin,
  RotateCcw,
  Route,
  Shuffle,
  PenTool,
  Stethoscope,
} from "lucide-react";
import { ExplainPopover } from "./ExplainPopover";
import type { LociState, Palace, PalaceItem } from "../../lib/loci-types";
import { ReviewDashboardIllustration } from "../../components/loci/LociIllustrations";
import { isItemDue, isWeakSpot } from "../../lib/loci-algorithms";

interface Props {
  state: LociState;
  onStartReview: (palace: Palace, mode: "recall" | "reverse" | "random") => void;
  onSelectPalace: (palace: Palace, view: "edit-route" | "place-items") => void;
  onEvolveItem?: (palace: Palace, itemId: string) => void;
  onEvolvePalace?: (palace: Palace) => void;
}

export const ReviewDashboard: FC<Props> = ({
  state,
  onStartReview,
  onSelectPalace,
  onEvolveItem,
  onEvolvePalace,
}) => {
  const [selectedPalaceId, setSelectedPalaceId] = useState<string>(
    state.palaces[0]?.id || "",
  );
  const [selectedNodeItem, setSelectedNodeItem] = useState<{
    item?: PalaceItem;
    locusIndex: number;
    spot: string;
    landmark: string;
  } | null>(null);

  const activePalaces = state.palaces.filter((p) => !p.archived);
  const selectedPalace = activePalaces.find((p) => p.id === selectedPalaceId) || activePalaces[0];

  // Aggregate due items across all palaces
  const dueSummary = activePalaces.map((p) => {
    const dueItems = p.items.filter((it) => isItemDue(it));
    return {
      palace: p,
      dueCount: dueItems.length,
      totalCount: p.items.length,
    };
  });

  const totalDueCount = dueSummary.reduce((sum, d) => sum + d.dueCount, 0);

  // Weak spots across selected palace or all palaces
  const allWeakSpots: { palace: Palace; item: PalaceItem; spotName: string }[] = [];
  activePalaces.forEach((p) => {
    p.items.filter(isWeakSpot).forEach((it) => {
      const loc = p.route.find((l) => l.id === it.locusId);
      allWeakSpots.push({
        palace: p,
        item: it,
        spotName: loc?.spot || "Unknown spot",
      });
    });
  });

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header with illustration */}
      <div className="loci-card text-center py-6">
        <ReviewDashboardIllustration />
        <h1 className="text-2xl font-bold tracking-tight mb-1 text-[var(--loci-text)]">
          Spatial Memory Review
        </h1>
        <p className="text-sm text-[var(--loci-text-muted)] max-w-xl mx-auto">
          Strengthen spatial associations over time. Nothing is mastered after a single walk;
          spaced retrieval transforms mental routes into permanent memories.
        </p>
      </div>

      {/* Due Now Summary */}
      <div className="loci-card space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--loci-border)] pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock size={20} className="text-[var(--loci-accent)]" aria-hidden="true" />
            <h2 className="text-base font-bold text-[var(--loci-text)]">
              Due for Spatial Retrieval ({totalDueCount} items across {activePalaces.length} palaces)
            </h2>
          </div>
        </div>

        {totalDueCount === 0 ? (
          <div className="text-center py-6 text-sm text-[var(--loci-text-muted)] flex items-center justify-center gap-2">
            <CheckCircle2 size={18} className="text-[var(--loci-success)]" aria-hidden="true" />
            <span>All spatial memories are scheduled for future review. Nothing is due right now.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {dueSummary
              .filter((d) => d.dueCount > 0)
              .map(({ palace, dueCount, totalCount }) => (
                <div key={palace.id} className="p-3 rounded-lg border border-[var(--loci-border)] bg-[var(--loci-surface-2)] flex flex-col justify-between space-y-3">
                  <div>
                    <strong className="block text-sm text-[var(--loci-text)]">{palace.name}</strong>
                    <span className="text-xs text-[var(--loci-text-muted)] flex items-center gap-1 mt-0.5">
                      <MapPin size={11} aria-hidden="true" />
                      <span>{palace.location}</span>
                    </span>
                    <span className="text-xs text-[var(--loci-warn)] font-medium mt-1 block">
                      {dueCount} of {totalCount} items due
                    </span>
                  </div>

                  <button
                    type="button"
                    className="loci-btn loci-btn-primary text-xs w-full justify-center min-h-[36px]"
                    onClick={() => onStartReview(palace, "recall")}
                  >
                    <Brain size={14} aria-hidden="true" />
                    <span>Review now</span>
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Palace Route Map & Visualizer */}
      {selectedPalace && (
        <div className="loci-card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--loci-border)] pb-3">
            <div className="flex items-center gap-2">
              <Route size={20} className="text-[var(--loci-accent)]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[var(--loci-text)]">
                Route Map: {selectedPalace.name}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {onEvolvePalace && (
                <button
                  type="button"
                  className="loci-btn text-xs min-h-[32px] px-2.5 text-[var(--loci-accent)] border-[var(--loci-accent)] bg-[rgba(95,179,173,0.08)] font-semibold"
                  onClick={() => onEvolvePalace(selectedPalace)}
                  title="Open the Curator to run Route Doctor (manual, results cached)"
                >
                  <Stethoscope size={13} aria-hidden="true" />
                  <span>Route Doctor</span>
                </button>
              )}

              {/* Selector if multiple palaces */}
              {activePalaces.length > 1 && (
                <select
                  className="text-xs p-1.5 rounded border border-[var(--loci-border)] bg-[var(--loci-surface-2)] text-[var(--loci-text)]"
                  value={selectedPalace.id}
                  onChange={(e) => setSelectedPalaceId(e.target.value)}
                  aria-label="Select palace route to inspect"
                >
                  {activePalaces.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.items.length} items)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* SVG Map of numbered nodes */}
          <div className="overflow-x-auto py-2">
            <SvgRouteMap
              palace={selectedPalace}
              onSelectNode={(item, locusIndex, spot, landmark) =>
                setSelectedNodeItem({ item, locusIndex, spot, landmark })
              }
            />
          </div>

          {/* Node Legend (Section 4.6: node states use icon + pattern + label, not color alone) */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-[var(--loci-text-muted)] pt-2 border-t border-[var(--loci-border)]">
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--loci-border)] bg-[var(--loci-surface-2)] inline-block" />
              <span>New / Unreviewed</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--loci-warn)] bg-[rgba(224,164,74,0.3)] inline-block" />
              <span>Due Now (CalendarClock)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--loci-success)] bg-[rgba(46,125,79,0.3)] inline-block" />
              <span>Scheduled (CheckCircle)</span>
            </span>
            <span className="flex items-center gap-1.5 text-[var(--loci-danger)] font-medium">
              <AlertTriangle size={14} aria-hidden="true" />
              <span>Weak Spot (Ease &lt; 1.8 or Lapses &ge; 2)</span>
            </span>
          </div>

          {/* Selected Node Inspector Drawer */}
          {selectedNodeItem && (
            <div className="p-4 rounded-xl border border-[var(--loci-border)] bg-[var(--loci-surface-2)] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[var(--loci-text)]">
                  Spot #{selectedNodeItem.locusIndex + 1}: {selectedNodeItem.spot}
                </span>
                <button
                  type="button"
                  className="text-[var(--loci-text-muted)] hover:text-[var(--loci-text)]"
                  onClick={() => setSelectedNodeItem(null)}
                >
                  Close
                </button>
              </div>
              <p className="text-[var(--loci-text-muted)]">
                <strong>Landmark:</strong> {selectedNodeItem.landmark}
              </p>

              {selectedNodeItem.item ? (
                <div className="pt-2 border-t border-[var(--loci-border)] space-y-1">
                  <p><strong>Anchored Item:</strong> {selectedNodeItem.item.text}</p>
                  <p className="italic text-[var(--loci-text-muted)]">"{selectedNodeItem.item.imageCue}"</p>
                  <div className="flex gap-4 pt-1 font-mono text-[11px] text-[var(--loci-text-muted)]">
                    <span>Interval: {selectedNodeItem.item.review.intervalDays} days</span>
                    <span>Ease factor: {selectedNodeItem.item.review.ease.toFixed(2)}</span>
                    <span>Lapses: {selectedNodeItem.item.review.lapses}</span>
                    <span>Due: {new Date(selectedNodeItem.item.review.dueAt).toLocaleDateString()}</span>
                    <ExplainPopover review={selectedNodeItem.item.review} showGrades label="Explain this due date" />
                  </div>
                </div>
              ) : (
                <p className="text-[var(--loci-text-muted)] italic">No item anchored to this spot yet.</p>
              )}
            </div>
          )}

          {/* Review Mode Launchers (Section 4.6: Standard, Reverse, Random) */}
          <div className="pt-2 border-t border-[var(--loci-border)] flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[var(--loci-text)]">Alternative Review Modes:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="loci-btn text-xs min-h-[36px]"
                disabled={selectedPalace.items.length === 0}
                onClick={() => onStartReview(selectedPalace, "random")}
                title="Recall items in shuffled order to test locus isolation"
              >
                <Shuffle size={14} aria-hidden="true" />
                <span>Random Order</span>
              </button>
              <button
                type="button"
                className="loci-btn text-xs min-h-[36px]"
                disabled={selectedPalace.items.length === 0}
                onClick={() => onStartReview(selectedPalace, "reverse")}
                title="Given the item, recall which spot it belonged to"
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Reverse Recall (Item → Spot)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weak Spots Analysis (Section 4.6 & 6) */}
      <div className="loci-card space-y-4">
        <div className="flex items-center gap-2 border-b border-[var(--loci-border)] pb-3">
          <AlertTriangle size={18} className="text-[var(--loci-warn)]" aria-hidden="true" />
          <h2 className="text-base font-bold text-[var(--loci-text)]">
            Weak Spots Analysis ({allWeakSpots.length})
          </h2>
        </div>

        {allWeakSpots.length === 0 ? (
          <p className="text-xs text-[var(--loci-text-muted)] py-2">
            No weak spots detected. Items with lapses &ge; 2 or ease factors &lt; 1.8 will appear here with suggestions to improve their mental cues.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-[var(--loci-text-muted)]">
              When a spot repeatedly fails recall, spatial memory science suggests the cue is either too mundane or poorly interacting with the landmark.
              You may rewrite the cue or move the item to a more distinct locus.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {allWeakSpots.map(({ palace, item, spotName }) => (
                <div key={item.id} className="p-3 rounded-lg border border-[var(--loci-warn)] bg-[rgba(224,164,74,0.06)] space-y-2 text-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <strong className="text-sm text-[var(--loci-text)]">{item.text}</strong>
                      <span className="block text-[var(--loci-text-muted)] mt-0.5">
                        at {spotName} ({palace.name})
                      </span>
                    </div>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--loci-surface)] border border-[var(--loci-warn)] text-[var(--loci-warn)]">
                      {item.review.lapses} lapses · Ease {item.review.ease.toFixed(2)}
                    </span>
                    <ExplainPopover review={item.review} label="Explain why this spot is flagged" />
                  </div>

                  <p className="text-[var(--loci-text-muted)] italic leading-relaxed">
                    "{item.imageCue}"
                  </p>

                    <div className="pt-2 border-t border-[var(--loci-border)] flex flex-wrap items-center gap-2">
                    {onEvolveItem && (
                      <button
                        type="button"
                        className="loci-btn text-xs min-h-[32px] px-2.5 text-[var(--loci-accent)] border-[var(--loci-accent)] bg-[rgba(95,179,173,0.08)] font-semibold"
                        onClick={() => onEvolveItem(palace, item.id)}
                        title="Cue Critic: four-axis score and one question. It does not rewrite your cue."
                      >
                        <PenTool size={12} aria-hidden="true" />
                        <span>Critique cue</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="loci-btn loci-btn-ghost text-xs min-h-[32px] px-2"
                      onClick={() => onSelectPalace(palace, "place-items")}
                    >
                      <Edit3 size={12} aria-hidden="true" />
                      <span>Rewrite cue</span>
                    </button>
                    <button
                      type="button"
                      className="loci-btn loci-btn-ghost text-xs min-h-[32px] px-2"
                      onClick={() => onSelectPalace(palace, "edit-route")}
                    >
                      <Compass size={12} aria-hidden="true" />
                      <span>Change locus</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* SVG Route Visualizer */
interface SvgRouteMapProps {
  palace: Palace;
  onSelectNode: (item: PalaceItem | undefined, locusIndex: number, spot: string, landmark: string) => void;
}

const SvgRouteMap: FC<SvgRouteMapProps> = ({ palace, onSelectNode }) => {
  const loci = palace.route;
  if (loci.length === 0) return null;

  // Generate an aesthetic curved snake layout for nodes
  const nodeSpacing = 90;
  const width = Math.max(600, loci.length * nodeSpacing + 60);
  const height = 150;

  const points = loci.map((_, i) => {
    const x = 50 + i * nodeSpacing;
    const y = 75 + Math.sin(i * 0.9) * 35;
    return { x, y };
  });

  // Construct SVG cubic path through all points
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mx = (p0.x + p1.x) / 2;
    pathD += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
  }

  return (
    <svg className="loci-route-map" viewBox={`0 0 ${width} ${height}`} style={{ minWidth: width }}>
      {/* Route Path Line */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--loci-border)"
        strokeWidth="3"
        strokeDasharray="5 5"
      />

      {/* Nodes */}
      {loci.map((loc, idx) => {
        const pt = points[idx];
        const item = palace.items.find((it) => it.locusId === loc.id);
        const due = item ? isItemDue(item) : false;
        const weak = item ? isWeakSpot(item) : false;
        const scheduled = item && !due && item.review.reps > 0;

        let stroke = "var(--loci-border)";
        let fill = "var(--loci-surface)";
        if (weak) {
          stroke = "var(--loci-danger)";
          fill = "rgba(240, 113, 103, 0.2)";
        } else if (due) {
          stroke = "var(--loci-warn)";
          fill = "rgba(224, 164, 74, 0.2)";
        } else if (scheduled) {
          stroke = "var(--loci-success)";
          fill = "rgba(46, 125, 79, 0.2)";
        }

        return (
          <g
            key={loc.id}
            className="loci-map-node"
            transform={`translate(${pt.x}, ${pt.y})`}
            onClick={() => onSelectNode(item, idx, loc.spot, loc.landmark)}
          >
            <circle cx="0" cy="0" r="16" fill={fill} stroke={stroke} strokeWidth="2.5" />
            <text
              x="0"
              y="4"
              textAnchor="middle"
              fontSize="11"
              fontWeight="bold"
              fill="var(--loci-text)"
              fontFamily="var(--mono)"
            >
              {idx + 1}
            </text>
            <text
              x="0"
              y="28"
              textAnchor="middle"
              fontSize="9"
              fill="var(--loci-text-muted)"
              fontWeight="500"
            >
              {loc.spot.length > 12 ? loc.spot.slice(0, 10) + "…" : loc.spot}
            </text>
            {weak && (
              <text x="12" y="-10" fontSize="11" fill="var(--loci-danger)">
                !
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
