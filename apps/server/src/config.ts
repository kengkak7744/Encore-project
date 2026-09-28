import 'dotenv/config';

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
const officialTicketmasterBase = 'https://app.ticketmaster.com/discovery/v2';
const configuredTicketmasterBase = process.env.TICKETMASTER_BASE_URL?.trim().replace(/\/+$/, '');

export const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgres://artist:artist@localhost:5432/artist_tracker',
  port: Number(process.env.PORT || 4000),
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
  chatModel: process.env.OLLAMA_CHAT_MODEL || 'qwen3:8b',
  embedModel: process.env.OLLAMA_EMBED_MODEL || 'qwen3-embedding:0.6b',
  xBearerToken: process.env.X_BEARER_TOKEN || '',
  xMonthlyLimitThb: Math.max(0, Math.min(350, Number(process.env.X_MONTHLY_LIMIT_THB || 350))),
  ticketmasterKey: process.env.TICKETMASTER_API_KEY || '',
  ticketmasterBaseUrl: configuredTicketmasterBase === officialTicketmasterBase ? configuredTicketmasterBase : officialTicketmasterBase,
  ticketmasterCountryCode: /^[A-Z]{2}$/.test(process.env.TICKETMASTER_COUNTRY_CODE || '') ? process.env.TICKETMASTER_COUNTRY_CODE! : 'TH',
  ticketmasterTimeoutMs: boundedNumber(process.env.TICKETMASTER_TIMEOUT_SECONDS, 10, 3, 30) * 1000,
  concertSchedulerEnabled: process.env.CONCERT_SCHEDULER_ENABLED !== 'false',
  bandsintownAppId: process.env.BANDSINTOWN_APP_ID || '',
  metaToken: process.env.META_ACCESS_TOKEN || '',
  metaVersion: process.env.META_GRAPH_VERSION || 'v22.0',
  instagramGraphToken: process.env.INSTAGRAM_GRAPH_ACCESS_TOKEN || '',
  instagramGraphUserId: process.env.INSTAGRAM_GRAPH_IG_USER_ID || '',
  instagramGraphVersion: /^v\d+\.\d+$/.test(process.env.INSTAGRAM_GRAPH_API_VERSION || '') ? process.env.INSTAGRAM_GRAPH_API_VERSION! : 'v25.0',
  instagramGraphTokenExpiresAt: process.env.INSTAGRAM_GRAPH_TOKEN_EXPIRES_AT || '',
  socialSchedulerEnabled: process.env.SOCIAL_SCHEDULER_ENABLED !== 'false',
  socialSyncIntervalMinutes: boundedNumber(process.env.SOCIAL_SYNC_INTERVAL_MINUTES, 60, 15, 1440),
  socialStaleAfterMinutes: boundedNumber(process.env.SOCIAL_STALE_AFTER_MINUTES, 60, 15, 10080),
  googleRoutesEnabled: process.env.GOOGLE_ROUTES_ENABLED === 'true',
  googleRoutesKey: process.env.GOOGLE_ROUTES_API_KEY || '',
  googleRoutesTimeoutMs: boundedNumber(process.env.GOOGLE_ROUTES_TIMEOUT_SECONDS, 5, 2, 30) * 1000,
  amadeusClientId: process.env.AMADEUS_CLIENT_ID || '',
  amadeusClientSecret: process.env.AMADEUS_CLIENT_SECRET || '',
  amadeusEnvironment: process.env.AMADEUS_ENV === 'production' ? 'production' : 'test',
  googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
};
