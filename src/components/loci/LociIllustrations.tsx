import type { FC, SVGProps } from "react";

export const PalaceLibraryIllustration: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 200 130"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="loci-illustration"
    {...props}
  >
    {/* Grand classical archway/doorway with a key */}
    <rect x="50" y="25" width="100" height="95" rx="6" strokeDasharray="3 3" opacity="0.4" />
    <path d="M65 120 V50 A35 35 0 0 1 135 50 V120" />
    <path d="M72 120 V52 A28 28 0 0 1 128 52 V120" opacity="0.6" />
    <path d="M55 120 H145" strokeWidth="2" />
    {/* Center key */}
    <g transform="translate(100, 70)" strokeWidth="1.8">
      <circle cx="0" cy="-12" r="7" fill="none" />
      <path d="M0 -5 V16 M0 6 H6 M0 12 H4" />
    </g>
    {/* Distant stars */}
    <circle cx="30" cy="35" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
    <circle cx="170" cy="40" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />
  </svg>
);

export const RouteBuilderIllustration: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 200 130"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="loci-illustration"
    {...props}
  >
    {/* Connected rooms along a dotted spatial path */}
    <rect x="25" y="65" width="40" height="35" rx="4" opacity="0.7" />
    <rect x="80" y="25" width="40" height="35" rx="4" opacity="0.7" />
    <rect x="135" y="65" width="40" height="35" rx="4" opacity="0.7" />
    {/* Dotted path connecting them */}
    <path d="M45 65 V45 H80 M120 45 H155 V65" strokeDasharray="4 4" />
    {/* Numbered path nodes */}
    <circle cx="45" cy="82" r="5" fill="currentColor" opacity="0.2" />
    <circle cx="45" cy="82" r="2" fill="currentColor" />
    <circle cx="100" cy="42" r="5" fill="currentColor" opacity="0.2" />
    <circle cx="100" cy="42" r="2" fill="currentColor" />
    <circle cx="155" cy="82" r="5" fill="currentColor" opacity="0.2" />
    <circle cx="155" cy="82" r="2" fill="currentColor" />
  </svg>
);

export const ItemPlacementIllustration: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 200 130"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="loci-illustration"
    {...props}
  >
    {/* Pedestal with an active memory item resting on it */}
    <path d="M60 115 H140 M70 115 V95 H130 V115" opacity="0.8" />
    {/* Memory box / object resting on spot */}
    <rect x="85" y="65" width="30" height="30" rx="3" />
    <path d="M85 75 H115 M100 65 V95" />
    {/* Radiating creative sparks / vivid mental imagery */}
    <path d="M100 45 V35 M78 50 L70 42 M122 50 L130 42" strokeDasharray="2 2" />
    <circle cx="100" cy="40" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const FirstWalkIllustration: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 200 130"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="loci-illustration"
    {...props}
  >
    {/* Footprints walking an open curved path */}
    <path d="M30 100 Q 100 110 100 65 T 170 30" strokeDasharray="3 3" opacity="0.5" />
    {/* Footprint shapes */}
    <g transform="translate(45, 95) rotate(-10)" opacity="0.8">
      <ellipse cx="0" cy="0" rx="3.5" ry="6" fill="currentColor" opacity="0.15" />
      <circle cx="-1" cy="-8" r="1.2" fill="currentColor" />
    </g>
    <g transform="translate(75, 85) rotate(-25)" opacity="0.8">
      <ellipse cx="0" cy="0" rx="3.5" ry="6" fill="currentColor" opacity="0.15" />
      <circle cx="-1" cy="-8" r="1.2" fill="currentColor" />
    </g>
    <g transform="translate(105, 60) rotate(-10)" opacity="0.8">
      <ellipse cx="0" cy="0" rx="3.5" ry="6" fill="currentColor" opacity="0.15" />
      <circle cx="-1" cy="-8" r="1.2" fill="currentColor" />
    </g>
    <g transform="translate(140, 42) rotate(15)" opacity="0.8">
      <ellipse cx="0" cy="0" rx="3.5" ry="6" fill="currentColor" opacity="0.15" />
      <circle cx="-1" cy="-8" r="1.2" fill="currentColor" />
    </g>
  </svg>
);

export const RecallSessionIllustration: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 200 130"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="loci-illustration"
    {...props}
  >
    {/* A lantern shining light onto the next locus in the dark */}
    <path d="M85 45 H115 L120 85 H80 Z" />
    <path d="M90 45 V35 Q100 25 110 35 V45" />
    <path d="M80 85 H120 V95 H80 Z" />
    <line x1="100" y1="52" x2="100" y2="78" strokeWidth="2" />
    {/* Cone of light */}
    <path d="M80 88 L30 120 H170 L120 88" opacity="0.15" strokeDasharray="3 3" />
    <circle cx="100" cy="110" r="4" fill="currentColor" opacity="0.4" />
  </svg>
);

export const ReviewDashboardIllustration: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 200 130"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="loci-illustration"
    {...props}
  >
    {/* Folded route map with marked landmark points */}
    <path d="M40 35 L75 25 L125 35 L160 25 V105 L125 115 L75 105 L40 115 Z" />
    <line x1="75" y1="25" x2="75" y2="105" strokeDasharray="2 2" />
    <line x1="125" y1="35" x2="125" y2="115" strokeDasharray="2 2" />
    {/* Map route path */}
    <path d="M55 80 Q 75 50 100 70 T 145 45" strokeWidth="2" />
    <circle cx="55" cy="80" r="3" fill="currentColor" />
    <circle cx="100" cy="70" r="3" fill="currentColor" />
    <circle cx="145" cy="45" r="3" fill="currentColor" />
  </svg>
);

export const SettingsIllustration: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 200 130"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="loci-illustration"
    {...props}
  >
    {/* Local device padlock and instrument slider */}
    <rect x="80" y="55" width="40" height="35" rx="5" />
    <path d="M88 55 V45 A12 12 0 0 1 112 45 V55" />
    <circle cx="100" cy="72" r="3" fill="currentColor" />
    {/* Sliders on sides */}
    <line x1="35" y1="50" x2="65" y2="50" opacity="0.6" />
    <circle cx="50" cy="50" r="3.5" fill="currentColor" opacity="0.3" />
    <line x1="135" y1="75" x2="165" y2="75" opacity="0.6" />
    <circle cx="150" cy="75" r="3.5" fill="currentColor" opacity="0.3" />
  </svg>
);

export const ImportExportIllustration: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 200 130"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="loci-illustration"
    {...props}
  >
    {/* Open storage box with an outgoing/incoming data arrow */}
    <path d="M60 55 L100 35 L140 55 L100 75 Z" />
    <path d="M60 55 V95 L100 115 V75" />
    <path d="M140 55 V95 L100 115" />
    {/* Arrow */}
    <path d="M100 25 V50 M93 32 L100 25 L107 32" strokeWidth="2" />
  </svg>
);
