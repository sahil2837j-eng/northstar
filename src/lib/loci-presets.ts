/* Precision Memory Palaces ("Like Cheating" Level)
   Engineered using World Memory Championship spatial indexing rules:
   - Zero path crossing (strict topological sequence)
   - Highly distinct physical landmarks (no generic furniture)
   - Embedded multi-sensory hooks (thermal, acoustic, tactile, olfactory)
   - Visceral physical interaction between item and landmark
   - Fully compatible with Method of Loci non-negotiable rules:
     User MUST confirm or adapt to their familiar real location.
*/

import type { Locus, Palace, PalaceItem } from "./loci-types";
import { createInitialReviewState } from "./loci-algorithms";

export interface PrecisionPreset {
  id: string;
  name: string;
  category: "championship" | "neuro-science" | "mental-models" | "observatory" | "elements";
  subtitle: string;
  locationDefault: string;
  locationPrompt: string;
  description: string;
  lociCount: number;
  tags: string[];
  route: Omit<Locus, "id" | "photoId" | "photoAlt">[];
  defaultItems: { text: string; imageCue: string }[];
}

export const PRECISION_PRESETS: PrecisionPreset[] = [
  {
    id: "major-system-peg",
    name: "World Memory Championship Major System (0–9)",
    category: "championship",
    subtitle: "The ultimate phonetic peg cheat code for instant number & data recall",
    locationDefault: "My Home Entry to Kitchen Route",
    locationPrompt: "Confirm a 10-spot walking route through your house or daily path to anchor these 10 pegs:",
    description:
      "Used by World Memory Champions to turn abstract digits into solid physical reality. 0=s/z (Sphere/Zoo), 1=t/d (Spear/Tea), 2=n (Noah/Net), 3=m (Ma/Clay), 4=r (Ray/Laser), 5=l (Law/Scales), 6=j/ch/sh (Jaw/Bones), 7=k/g (Key/Safe), 8=f/v (Foe/Shield), 9=p/b (Pie/Oven).",
    lociCount: 10,
    tags: ["Championship", "Numbers", "Peg System", "High Potency"],
    route: [
      { order: 1, spot: "Front porch welcome mat", landmark: "Coarse bristled coir doormat", sense: "Scratchy dry fibers and morning dew" },
      { order: 2, spot: "Entrance hallway mirror", landmark: "Beveled gilt-edged wall mirror", sense: "Cold glass reflection and polished brass" },
      { order: 3, spot: "Coat closet folding door", landmark: "Louvered slatted pine door with brass knob", sense: "Dry pine aroma and rattling wooden slats" },
      { order: 4, spot: "Living room archway threshold", landmark: "Carved walnut arch with fluted molding", sense: "Beeswax finish and solid hardwood echo" },
      { order: 5, spot: "Corner fireplace hearth", landmark: "Rough fieldstone mantel & cast-iron grate", sense: "Warm residual soot and crackling ash" },
      { order: 6, spot: "Dining room chandelier", landmark: "Tiered faceted crystal chandelier", sense: "Ringing crystal chime and bright warm halogen glow" },
      { order: 7, spot: "Kitchen swinging door", landmark: "Heavy stainless-steel push plate", sense: "Chilly brushed steel and clicking spring hinge" },
      { order: 8, spot: "Granite kitchen island", landmark: "Polished black galaxy granite slab", sense: "Ice-cold stone surface with flecks of gold" },
      { order: 9, spot: "Kitchen gas range cooktop", landmark: "Heavy black cast-iron burner trivet", sense: "Sizzling blue flame heat and faint natural gas" },
      { order: 10, spot: "Pantry walk-in threshold", landmark: "Magnetic frosted glass pantry latch", sense: "Rich roasted coffee aroma and clicking magnet" },
    ],
    defaultItems: [
      { text: "0 — Sphere (S / Z sound)", imageCue: "A blinding, vibrating chrome SPHERE rolls violently over the bristled doormat, shooting static sparks into the fibers!" },
      { text: "1 — Spear (T / D sound)", imageCue: "A razor-sharp tribal SPEAR punches straight through the gilt-edged mirror, spiderwebbing the glass with deafening cracks!" },
      { text: "2 — Net (N sound)", imageCue: "A heavy wet fisherman's NET full of thrashing silver fish tangles tightly through the closet louvers, shaking the door!" },
      { text: "3 — Molten Clay (M sound)", imageCue: "A tidal wave of hot steaming terracotta CLAY pours through the walnut archway, coating the molding in thick wet mud!" },
      { text: "4 — Ray / Laser (R sound)", imageCue: "A focused emerald LASER RAY cuts sizzling red-hot lines directly into the fieldstone mantel, smoking with stone dust!" },
      { text: "5 — Scales of Law (L sound)", imageCue: "A massive pair of golden SCALES OF LAW hangs from the crystal chandelier, violently rocking as crystal prisms crash down!" },
      { text: "6 — Jawbone (J / Ch / Sh sound)", imageCue: "A prehistoric giant JAWBONE snaps shut against the stainless-steel push plate, leaving deep gouges with a metallic clang!" },
      { text: "7 — Golden Key (K / G sound)", imageCue: "An oversized glowing KEY made of pure gold drills itself into the granite island, spinning with a screeching mechanical whine!" },
      { text: "8 — Tower Shield (F / V sound)", imageCue: "A heavy spiky viking FOE SHIELD slams down onto the cast-iron gas burners, sparking against the blazing blue flame!" },
      { text: "9 — Molten Pie (P / B sound)", imageCue: "A piping-hot cherry PIE violently explodes inside the magnetic pantry door, splattering scalding boiling fruit over the glass!" },
    ],
  },
  {
    id: "neuro-cranial-12",
    name: "The Anatomical Neuro-Vault: 12 Cranial Nerves",
    category: "neuro-science",
    subtitle: "Medical-grade mnemonic palace: I through XII in anatomical sequence",
    locationDefault: "University Science Hall or Hospital Corridor",
    locationPrompt: "Confirm a 12-spot walking path through a familiar campus, hospital, or spacious building:",
    description:
      "The gold standard for medical students. Maps all 12 cranial nerves (Olfactory, Optic, Oculomotor, Trochlear, Abducens, Trigeminal, Facial, Vestibulocochlear, Glossopharyngeal, Vagus, Accessory, Hypoglossal) with high-impact visual anchors.",
    lociCount: 12,
    tags: ["Medical", "Neuroanatomy", "Biology", "High Precision"],
    route: [
      { order: 1, spot: "Science Building Revolving Door", landmark: "Curved tempered glass revolving wing", sense: "Whooshing air rushing past and squeaking rubber gasket" },
      { order: 2, spot: "Security Checkpoint Desk", landmark: "High black quartz reception counter", sense: "Humming metal detector and sharp badge scanner beep" },
      { order: 3, spot: "Central Atrium Fountain", landmark: "Cascading tiered granite water wall", sense: "Humid chlorinated mist and crashing water roar" },
      { order: 4, spot: "Elevator Lobby Call Station", landmark: "Brushed brass dual call button panel", sense: "Illuminated orange arrows and soft mechanical chime" },
      { order: 5, spot: "Elevator Mirrored Cab Interior", landmark: "Full-height rear safety mirror", sense: "Weightless stomach drop and polished steel handrail" },
      { order: 6, spot: "Third Floor Skybridge", landmark: "Floor-to-ceiling glass panoramic wall", sense: "Vast dizzying height and sunny warm glass pane" },
      { order: 7, spot: "Anatomy Lecture Hall Double Doors", landmark: "Heavy oak fire doors with brass kickplates", sense: "Heavy pneumatic door closer hiss and polished wood" },
      { order: 8, spot: "First Row Demonstration Table", landmark: "Black chemical-resistant resin laboratory bench", sense: "Cold antiseptic ethanol aroma and bright overhead spotlight" },
      { order: 9, spot: "Lectern Microphone Stand", landmark: "Gooseneck microphone on walnut podium", sense: "Sensitive electronic feedback hum and angled reading lamp" },
      { order: 10, spot: "Ceiling Projection Screen", landmark: "Motorized motorized silver-beaded screen", sense: "Electric motor drone and bright projection beam" },
      { order: 11, spot: "Auditorium Tiered Seating Steps", landmark: "Cast-iron folding seat row #7", sense: "Creaking spring-loaded hinge and navy fabric upholstery" },
      { order: 12, spot: "Emergency Exit Stairwell Door", landmark: "Phosphorescent green emergency push bar", sense: "Drafty cold concrete echo and metallic latch click" },
    ],
    defaultItems: [
      { text: "CN I: Olfactory Nerve (Smell)", imageCue: "A giant disembodied NOSE wedged inside the revolving door violently sneezes pungent black pepper, spinning the glass wings!" },
      { text: "CN II: Optic Nerve (Vision)", imageCue: "A gigantic glowing CYCLOPS EYE with two iris rings stares from the security desk, blinding the scanner with optical laser flashes!" },
      { text: "CN III: Oculomotor Nerve (Eye Movement)", imageCue: "Three motorized robotic arms violently jerk a set of giant moving eyeballs back and forth in the cascading fountain water!" },
      { text: "CN IV: Trochlear Nerve (Superior Oblique)", imageCue: "A mechanical PULLEY (trochlea) made of bronze cables crushes the brass elevator button panel while hoisting an anchor!" },
      { text: "CN V: Trigeminal Nerve (3 Facial Branches)", imageCue: "A three-pronged medieval TRIDENT strikes the elevator mirror, splitting into ophthalmic, maxillary, and mandibular lightning bolts!" },
      { text: "CN VI: Abducens Nerve (Abducts Eye)", imageCue: "A flying saucer ABDUCTS six lab scientists right off the skybridge glass wall, pulling them outward with an anti-gravity beam!" },
      { text: "CN VII: Facial Nerve (Facial Expression)", imageCue: "A theatrical mask with SEVEN exaggerated grinning faces is nailed to the oak lecture doors, weeping bitter tears!" },
      { text: "CN VIII: Vestibulocochlear Nerve (Hearing & Balance)", imageCue: "An enormous spiraling SNAIL SHELL (cochlea) blares deafening 8-track ear music on the resin lab bench, spinning wildly out of balance!" },
      { text: "CN IX: Glossopharyngeal Nerve (Tongue & Throat)", imageCue: "A nine-foot long purple TONGUE wraps around the lectern microphone, choking and swallowing a whole silver pharynx!" },
      { text: "CN X: Vagus Nerve (Parasympathetic Wanderer)", imageCue: "A VAGABOND nomad in Roman armor strangles a beating human heart on the projection screen, dropping heart rate to zero!" },
      { text: "CN XI: Accessory Nerve (Sternocleidomastoid & Trapezius)", imageCue: "A muscular bodybuilder shrugging his massive shoulders wearing eleven heavy gold NECKLACE ACCESSORIES on folding seat #7!" },
      { text: "CN XII: Hypoglossal Nerve (Tongue Muscles)", imageCue: "A hyper-muscular HYPODERMIC needle tongue punches right through the green emergency exit bar, licking the concrete walls!" },
    ],
  },
  {
    id: "mental-models-10",
    name: "The Sovereign Strategist: 10 Mental Models Citadel",
    category: "mental-models",
    subtitle: "Monumental architectural loci for core decision-making heuristics",
    locationDefault: "City Hall or Grand Public Library",
    locationPrompt: "Confirm a 10-spot walking route through a majestic public building, library, or downtown square:",
    description:
      "Anchor the 10 foundational mental models of world-class strategists (Charlie Munger, John Boyd, Richard Feynman) to permanent physical landmarks: First Principles, Inversion, Second-Order Thinking, Occam's Razor, and more.",
    lociCount: 10,
    tags: ["Strategy", "Mental Models", "Thinking", "Cognitive Mastery"],
    route: [
      { order: 1, spot: "Grand Marble Plaza Steps", landmark: "Carved Corinthian marble column base", sense: "Sun-bleached white marble and city street hum" },
      { order: 2, spot: "Rotunda Entry Portico", landmark: "Monumental bronze double doors with relief carvings", sense: "Heated bronze smell and echoing portico acoustics" },
      { order: 3, spot: "Central Mosaic Vestibule", landmark: "Intricate geometric tiled compass rose floor", sense: "Clicking heels on glazed tile and cool marble air" },
      { order: 4, spot: "Grand Spiral Marble Staircase", landmark: "Sweeping brass balustrade railing", sense: "Smooth chilled brass under hand and upward soaring curve" },
      { order: 5, spot: "First Landing Stained Glass Window", landmark: "Arched multi-colored rose stained glass", sense: "Dappled jewel-toned light beams and leaded frame" },
      { order: 6, spot: "Main Reading Room Threshold", landmark: "Pair of leather-padded swing doors", sense: "Aroma of ancient paper, cedar wood, and quiet rustling" },
      { order: 7, spot: "Central Research Card Catalog Desk", landmark: "Solid oak card catalog cabinet with brass pulls", sense: "Ticking grandfather clock and clicking brass drawers" },
      { order: 8, spot: "Law & Philosophy Mezzanine Gallery", landmark: "Wrought-iron balcony overlook with book stacks", sense: "Leather vellum aroma and high vertigo ceiling height" },
      { order: 9, spot: "Rare Manuscripts Vault Door", landmark: "Heavy steel vault door with rotating combination dial", sense: "Refrigerated climate-controlled air and heavy steel lock" },
      { order: 10, spot: "Rooftop Cupola Telescope Balcony", landmark: "Circular stone balustrade open to the sky", sense: "Brisk mountain wind and 360-degree clear horizon" },
    ],
    defaultItems: [
      { text: "1. First Principles Thinking", imageCue: "A glowing sledgehammer smashes the Corinthian column base down to its fundamental ATOMS, revealing glowing raw physics axioms!" },
      { text: "2. Inversion (Always Invert)", imageCue: "The giant bronze doors are violently flipped UPSIDE DOWN, with the floor becoming the ceiling as gravity completely reverses!" },
      { text: "3. Second-Order Thinking", imageCue: "A giant chess grandmaster knocks a domino on the compass rose floor, setting off a chain of cascading explosions into the distance!" },
      { text: "4. Occam's Razor", imageCue: "A razor-sharp Damascus steel STRAIGHT RAZOR slices cleanly through the sweeping brass balustrade, cutting away all unnecessary complexity!" },
      { text: "5. Circle of Competence", imageCue: "A burning ring of golden fire scorches a circular boundary onto the stained glass window; anything outside the circle instantly freezes!" },
      { text: "6. Compounding (Exponential Growth)", imageCue: "A single penny on the leather swing doors duplicates into an avalanche of gold coins that bursts through the doorway!" },
      { text: "7. Pareto Principle (80/20 Rule)", imageCue: "Only 2 out of 10 brass drawers on the catalog cabinet suddenly roar to life, producing 80 blinding beams of pure laser light!" },
      { text: "8. Hanlon's Razor", imageCue: "A bumbling, goofy clown accidentally trips over the wrought-iron mezzanine rail, spilling harmless colorful confetti instead of evil poison!" },
      { text: "9. Ashby's Law of Requisite Variety", imageCue: "The steel vault door morphs into a shapeshifting kaleidoscope of 100 different keyholes, adapting to counter every possible lockpick!" },
      { text: "10. Antifragility (Gains from Chaos)", imageCue: "A brutal thunderstorm and lightning bolts strike the rooftop cupola, and the stone grows TWICE as thick and luminous with every strike!" },
    ],
  },
  {
    id: "observatory-master",
    name: "The Sovereign Observatory & Clocktower",
    category: "observatory",
    subtitle: "Aesthetic master route matching NorthStar's Midnight Observatory visual architecture",
    locationDefault: "Astronomical Observatory, Hilltop Tower, or Scenic Route",
    locationPrompt: "Confirm a 10-spot ascent path (like a multi-level building, park trail, or scenic overlook):",
    description:
      "Calibrated to NorthStar's astronomical instrument system. From the Obsidian Gateway through the Foucault Pendulum Pit, the Achromatic Telescope, and the Zenith Crow's Nest. Perfect for custom master memory lists.",
    lociCount: 10,
    tags: ["Observatory", "Architecture", "Universal", "Midnight Design"],
    route: [
      { order: 1, spot: "Obsidian Gateway Threshold", landmark: "Cast-iron lion head knocker on obsidian doors", sense: "Cold polished obsidian & bitter metallic iron tang" },
      { order: 2, spot: "Foucault Pendulum Abyss", landmark: "Suspended brass pendulum bob swinging over calibrated dial", sense: "Rhythmic whoosh of wire, ozone & clicking floor pegs" },
      { order: 3, spot: "Spiral Granite Turret Stair", landmark: "Cantilevered granite steps worn smooth by centuries", sense: "Chilly gritty masonry & sea wind echo through arrowslits" },
      { order: 4, spot: "Great Refractor Dome Chamber", landmark: "Massive brass achromatic telescope tube on cast pier", sense: "Polished crown glass reflection & warm machine oil" },
      { order: 5, spot: "Celestial Armillary Spheres", landmark: "Interlocking nested bronze equatorial rings", sense: "Spinning bronze longitude rings & fragrant beeswax" },
      { order: 6, spot: "Meridian Transit Observation Slit", landmark: "Sliding steel roof shutter open to deep night", sense: "Slit of freezing night air & pine forest scent" },
      { order: 7, spot: "Horological Escapement Gearworks", landmark: "Six-foot deadbeat escapement gear with weighted pendulum", sense: "Loud mechanical tick-tock & hot friction brass" },
      { order: 8, spot: "Star Atlas Vellum Archive", landmark: "Floor-to-ceiling dark oak map drawers", sense: "Musty vellum, ancient oak shelves & binding glue" },
      { order: 9, spot: "Copper Cupola External Catwalk", landmark: "Curved copper safety railing overlooking the cliffs", sense: "Green verdigris patina, howling altitude wind" },
      { order: 10, spot: "Zenith Observation Deck", landmark: "Polished silver azimuth compass plate on stone altar", sense: "Vast panoramic dark horizon, solitary north star glow" },
    ],
    defaultItems: [
      { text: "Knowledge Anchor 1", imageCue: "An erupting volcanic crystal bursts from the lion knocker's mouth, showering the obsidian threshold in liquid amethyst!" },
      { text: "Knowledge Anchor 2", imageCue: "The swinging brass pendulum bob violently strikes a glowing tungsten bell, sending soundwaves that shatter the stone dial!" },
      { text: "Knowledge Anchor 3", imageCue: "A frozen river of blue glacier ice coats the granite stairs; stepping on it causes the steps to chime like xylophone keys!" },
      { text: "Knowledge Anchor 4", imageCue: "A blinding supernova beams through the refractor lens, burning a glowing holographic star constellation onto the brass tube!" },
      { text: "Knowledge Anchor 5", imageCue: "A mechanical clockwork falcon perches inside the armillary sphere, violently beating wings made of spinning bronze gears!" },
      { text: "Knowledge Anchor 6", imageCue: "An aurora borealis of neon violet and green plasma pours into the roof shutter, freezing the steel frame in dry ice!" },
      { text: "Knowledge Anchor 7", imageCue: "A tidal wave of ticking gold pocket watches pours out of the escapement gears, jamming the pendulum with loud metallic clatter!" },
      { text: "Knowledge Anchor 8", imageCue: "Ancient leather star charts unroll themselves from the drawers, floating into the air and forming a glowing paper bridge!" },
      { text: "Knowledge Anchor 9", imageCue: "A bolt of lightning grounds itself into the verdigris copper catwalk railing, charging the metal with humming electromagnetic force!" },
      { text: "Knowledge Anchor 10", imageCue: "A pure diamond NorthStar prism levitates above the azimuth plate, casting ten permanent laser beams across the night sky!" },
    ],
  },
  {
    id: "periodic-table-10",
    name: "Elemental Core: Chemical Elements (1–10)",
    category: "elements",
    subtitle: "Hydrogen through Neon with high-potency chemical reactions",
    locationDefault: "My Kitchen and Backyard",
    locationPrompt: "Confirm a 10-spot walking route starting at your kitchen counter and walking into the yard:",
    description:
      "Memorize atomic numbers 1–10 (H, He, Li, Be, B, C, N, O, F, Ne) with visceral, explosive physical reactions anchored to familiar household spots.",
    lociCount: 10,
    tags: ["Chemistry", "Science", "Elements", "Foundations"],
    route: [
      { order: 1, spot: "Kitchen sink faucet", landmark: "Gooseneck chrome mixer faucet", sense: "Cold rushing tap water and metallic chrome" },
      { order: 2, spot: "Dishwasher front door", landmark: "Stainless steel drop-down door handle", sense: "Steam venting and hot detergent aroma" },
      { order: 3, spot: "Kitchen stove burner #1", landmark: "Front left cast-iron gas trivet", sense: "Hissing gas and click-click-click electric igniter" },
      { order: 4, spot: "Microwave oven cavity", landmark: "Rotating glass turntable plate", sense: "Warm hum of magnetron and glowing yellow light" },
      { order: 5, spot: "Refrigerator freezer door", landmark: "Recessed white plastic gasket handle", sense: "Blast of sub-zero frosty vapor" },
      { order: 6, spot: "Spice rack shelf", landmark: "Tiered spinning wooden carousel", sense: "Pungent black pepper, cloves, and cinnamon" },
      { order: 7, spot: "Kitchen trash bin lid", landmark: "Foot-pedal brushed steel step bin", sense: "Mechanical pedal squeak and slamming lid" },
      { order: 8, spot: "Backyard sliding screen door", landmark: "Aluminum mesh sliding screen latch", sense: "Chilly outdoor draft and vibrating wire mesh" },
      { order: 9, spot: "Garden hose reel", landmark: "Wall-mounted green hose cylinder with brass nozzle", sense: "Rubber hose smell and cold pressurized brass" },
      { order: 10, spot: "Backyard stone firepit", landmark: "Circular ring of stacked river stones", sense: "Crunch of dry pine needles and cedar wood smoke" },
    ],
    defaultItems: [
      { text: "1. Hydrogen (H — 1)", imageCue: "A high-pressure HYDROGEN rocket engine blasts out of the chrome faucet, boiling the sink water instantly into roaring steam!" },
      { text: "2. Helium (He — 2)", imageCue: "A thousand metallic HELIUM balloons erupt from the dishwasher door, speaking in squeaky cartoon voices as they hit the ceiling!" },
      { text: "3. Lithium (Li — 3)", imageCue: "A burning LITHIUM battery explodes with blazing bright crimson-purple fireworks directly over the cast-iron gas trivet!" },
      { text: "4. Beryllium (Be — 4)", imageCue: "A giant glittering green BERYLLIUM emerald spins inside the microwave, shooting blinding laser beams that crack the glass plate!" },
      { text: "5. Boron (B — 5)", imageCue: "A hard, indestructible BORAX crystal armor covers the freezer door, withstanding heavy sledgehammer strikes with metallic rings!" },
      { text: "6. Carbon (C — 6)", imageCue: "A sparkling 50-carat CARBON diamond crushed by a block of pure black coal sends dust flying across the spice rack carousel!" },
      { text: "7. Nitrogen (N — 7)", imageCue: "A tank of liquid NITROGEN flash-freezes the entire steel trash bin; kicking the pedal shatters the bin into thousands of icy shards!" },
      { text: "8. Oxygen (O — 8)", imageCue: "Two pure OXYGEN scuba tanks hiss loudly against the screen door, fueling a roaring bright blue blowtorch flame!" },
      { text: "9. Fluorine (F — 9)", imageCue: "A cloud of yellow, toxic FLUORINE gas melts the brass nozzle like melting butter, corroding the rubber hose into foam!" },
      { text: "10. Neon (Ne — 10)", imageCue: "A blazing reddish-orange NEON open sign buzzes loudly inside the stone firepit, illuminating the backyard like Times Square!" },
    ],
  },
];

export function instantiatePresetPalace(
  preset: PrecisionPreset,
  confirmedLocation: string,
  now: Date = new Date(),
): Palace {
  const palaceId = "palace_" + Math.random().toString(36).slice(2, 9);

  const route: Locus[] = preset.route.map((locus, idx) => ({
    id: `loc_${palaceId}_${idx + 1}`,
    order: locus.order,
    spot: locus.spot,
    landmark: locus.landmark,
    sense: locus.sense,
  }));

  const items: PalaceItem[] = preset.defaultItems.map((itemDef, idx) => {
    const locus = route[idx];
    return {
      id: `item_${palaceId}_${idx + 1}`,
      locusId: locus ? locus.id : "",
      text: itemDef.text,
      imageCue: itemDef.imageCue,
      // Template cues are drafts: the user must edit or approve each one (rule 4).
      imageSource: "ai-edited",
      cueApproved: false,
      review: createInitialReviewState(now),
      needsReencode: false,
    };
  });

  return {
    id: palaceId,
    name: preset.name,
    location: confirmedLocation.trim() || preset.locationDefault,
    locationConfirmed: true,
    route,
    items,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
