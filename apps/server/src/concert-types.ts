export type ConcertEvent = {
  title: string; url: string; startsAt: string | null; endsAt?: string | null; timeTba?: boolean;
  venue?: string | null; city?: string | null; country?: string; description?: string | null;
  image?: string | null; priceMin?: number | null; priceMax?: number | null; priceNote?: string | null;
  currency?: string; status?: string; artist?: string | null; completeSchedule?: boolean; performanceLabel?: string | null;
  ticketmasterAttractionId?: string; artistEvidenceUrl?: string;
  listingOnly?: boolean;
};

export type DiscoveryMetrics = {
  discovered: number; attempted: number; parsedPages: number; emptyPages: number;
  fetchFailures: number; filteredPast: number; pending: number; limited: boolean;
  discovery: string; warnings: string[]; rejectedDates?: number;
  catalogUrls?: string[]; catalogComplete?: boolean; pages?: CatalogPage[]; listingFallback?: number;
};
export type CatalogPage = { url: string; outcome: 'parsed' | 'empty' | 'failed'; sessions: number; error?: string; listingFallback?: boolean };
export type DiscoveryResult = { events: ConcertEvent[]; metrics: DiscoveryMetrics };
export const primaryConcertSources = ['ThaiTicketMajor', 'Eventpop', 'The Concert', 'Ticketmelon'] as const;
