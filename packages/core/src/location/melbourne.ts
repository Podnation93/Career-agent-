/**
 * Melbourne location data, ported from the legacy Python config.yaml.
 * Suburbs in `EXCELLENT_REGIONS` are the user's priority areas; `GOOD_SUBURBS`
 * are acceptable but secondary. Everything else is "poor" unless remote/hybrid.
 */
import type { WorkType } from "@jobpilot/shared";

export const EXCELLENT_REGIONS: Record<string, string[]> = {
  western_melbourne: [
    "Footscray",
    "Sunshine",
    "Werribee",
    "Tarneit",
    "Hoppers Crossing",
    "Deer Park",
    "Laverton",
    "Truganina",
    "Altona",
    "Point Cook",
    "Yarraville",
    "Williamstown",
  ],
  melbourne_cbd: [
    "Melbourne CBD",
    "Melbourne",
    "Docklands",
    "Southbank",
    "North Melbourne",
    "Carlton",
  ],
  richmond: ["Richmond", "Cremorne", "Burnley", "Abbotsford", "Hawthorn"],
};

export const GOOD_SUBURBS: string[] = [
  "Newport",
  "Spotswood",
  "Maribyrnong",
  "Kensington",
  "West Melbourne",
  "East Melbourne",
  "Collingwood",
  "Fitzroy",
  "South Yarra",
  "Prahran",
  "St Kilda Road",
  "Brooklyn",
  "Caroline Springs",
];

const ALL_EXCELLENT = Object.values(EXCELLENT_REGIONS).flat();

export interface LocationPrefs {
  acceptRemote: boolean;
  acceptHybrid: boolean;
  acceptCbd: boolean;
  /** Optional extra target locations from the user's profile. */
  targetLocations?: string[];
}

export type LocationTier = "excellent" | "good" | "poor" | "remote";

function norm(s: string): string {
  return s.toLowerCase().replace(/,?\s*(vic|victoria|australia)\b/g, "").replace(/\s+/g, " ").trim();
}

function matchesAny(haystack: string, suburbs: string[]): boolean {
  const h = norm(haystack);
  return suburbs.some((s) => h.includes(norm(s)));
}

/**
 * Classify a job's location and return a 0–100 location score plus a tier.
 * Remote/hybrid roles score high if the user accepts them, regardless of suburb.
 */
export function locationScore(
  jobLocation: string | null | undefined,
  workType: WorkType,
  prefs: LocationPrefs,
): { score: number; tier: LocationTier; reason: string } {
  const loc = jobLocation ?? "";

  if (workType === "remote" && prefs.acceptRemote) {
    return { score: 95, tier: "remote", reason: "Remote role and you accept remote work." };
  }
  if (workType === "hybrid" && prefs.acceptHybrid) {
    // Hybrid still benefits from a good base suburb.
    if (matchesAny(loc, ALL_EXCELLENT)) {
      return { score: 100, tier: "excellent", reason: "Hybrid in a priority Melbourne area." };
    }
    return { score: 85, tier: "good", reason: "Hybrid role you accept." };
  }

  const extra = prefs.targetLocations ?? [];
  if (matchesAny(loc, ALL_EXCELLENT) || matchesAny(loc, extra)) {
    return { score: 100, tier: "excellent", reason: `Priority location: ${loc}.` };
  }
  if (matchesAny(loc, GOOD_SUBURBS)) {
    return { score: 75, tier: "good", reason: `Acceptable nearby location: ${loc}.` };
  }
  if (prefs.acceptCbd && matchesAny(loc, EXCELLENT_REGIONS.melbourne_cbd ?? [])) {
    return { score: 90, tier: "excellent", reason: "Melbourne CBD (you accept CBD travel)." };
  }
  if (!loc) {
    return { score: 50, tier: "poor", reason: "Location unknown." };
  }
  return { score: 25, tier: "poor", reason: `Outside priority areas: ${loc}.` };
}
