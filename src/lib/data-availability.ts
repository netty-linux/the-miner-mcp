export type DataAvailability = "available" | "partial" | "unavailable";

export interface SourceStatus {
  source: string;
  availability: DataAvailability;
  recordCount: number;
  error?: string;
  note?: string;
}

export function buildSourceStatus(
  source: string,
  recordCount: number,
  error?: string,
  note?: string,
): SourceStatus {
  return {
    source,
    availability: recordCount > 0 ? "available" : error ? "unavailable" : "partial",
    recordCount,
    error,
    note,
  };
}

export function overallAvailability(sources: SourceStatus[]): DataAvailability {
  const available = sources.filter((s) => s.availability === "available").length;
  if (available === 0) return "unavailable";
  if (available === sources.length) return "available";
  return "partial";
}