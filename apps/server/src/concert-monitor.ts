import { primaryConcertSources } from './concert-types.js';

const hour = 3_600_000;
export type MonitorWindow = { id: string | number; started_at: string | Date; ends_at: string | Date; reason?: string | null };
export type MonitorRun = { source_name: string; scheduled_at: string | Date; started_at: string | Date; finished_at: string | Date | null; status: string; items_seen: number; items_changed: number; error: string | null; metrics: Record<string, unknown> };
const instant = (value: string | Date) => new Date(value).getTime();
export function buildConcertMonitor(window: MonitorWindow | null, runs: MonitorRun[], now = Date.now()) {
  if (!window) return null;
  const start = instant(window.started_at), end = instant(window.ends_at);
  const bySlot = new Map<string, MonitorRun>();
  for (const run of [...runs].sort((a,b) => instant(a.started_at) - instant(b.started_at))) {
    const scheduled = instant(run.scheduled_at);
    if (scheduled < start || scheduled >= end || (scheduled - start) % hour) continue;
    const key = scheduled + '|' + run.source_name;
    // A retry cannot erase evidence of an earlier failed scheduled attempt.
    if (!bySlot.has(key)) bySlot.set(key, run);
  }
  const rows = Array.from({ length: 168 }, (_unused, index) => primaryConcertSources.map(source => {
    const scheduled = start + index * hour;
    const run = bySlot.get(scheduled + '|' + source);
    const status = now < scheduled ? 'future' : run?.status || (now < scheduled + hour ? 'awaiting' : 'missing');
    return { hour: index + 1, source, scheduledAt: new Date(scheduled).toISOString(), status,
      startedAt: run ? new Date(run.started_at).toISOString() : null,
      finishedAt: run?.finished_at ? new Date(run.finished_at).toISOString() : null,
      late: !!run && instant(run.started_at) >= scheduled + hour,
      seen: run?.items_seen || 0, added: run?.items_changed || 0,
      error: run?.error || null, metrics: Object.fromEntries(Object.entries(run?.metrics || {}).filter(([key]) => !['pages','catalogUrls'].includes(key))) };
  })).flat();
  const elapsedHours = Math.max(0, Math.min(168, Math.floor((now - start) / hour)));
  const elapsed = rows.filter(row => row.hour <= elapsedHours);
  const checked = elapsed.filter(row => ['success','partial','failed'].includes(row.status));
  const issues = elapsed.filter(row => row.status !== 'success' || row.late);
  const cadenceIssues = elapsed.filter(row => !row.startedAt || row.late || !row.finishedAt);
  const daily = Array.from({ length: 7 }, (_unused,index) => {
    const day = elapsed.filter(row => row.hour > index * 24 && row.hour <= (index + 1) * 24);
    return { day: index + 1, startsAt: new Date(start + index * 24 * hour).toISOString(),
      expected: day.length, checked: day.filter(row => ['success','partial','failed'].includes(row.status)).length,
      success: day.filter(row => row.status === 'success').length,
      partial: day.filter(row => row.status === 'partial').length,
      failed: day.filter(row => row.status === 'failed').length,
      missing: day.filter(row => row.status === 'missing').length,
      other: day.filter(row => ['running','skipped','awaiting'].includes(row.status)).length };
  });
  const coverage = primaryConcertSources.map(source => {
    const history = runs.filter(run => run.source_name === source && instant(run.scheduled_at) >= start && instant(run.scheduled_at) < end && instant(run.started_at) <= now)
      .sort((a,b) => instant(a.started_at) - instant(b.started_at));
    const catalogRun = [...history].reverse().find(run => Array.isArray(run.metrics.catalogUrls));
    const catalog = new Set<string>(catalogRun ? (catalogRun.metrics.catalogUrls as unknown[]).filter((url): url is string => typeof url === 'string') : []);
    const evidence = new Map<string,{ url: string; outcome: string; checkedAt: string; error: string | null; listingFallback: boolean }>();
    for (const run of history) for (const page of Array.isArray(run.metrics.pages) ? run.metrics.pages : []) {
      if (!page || typeof page.url !== 'string' || !['parsed','empty','failed'].includes(page.outcome)) continue;
      evidence.set(page.url,{ url: page.url,outcome: page.outcome,checkedAt: new Date(run.started_at).toISOString(),error: typeof page.error === 'string' ? page.error : null,listingFallback: page.listingFallback === true });
    }
    const pages = [...catalog].sort().map(url => evidence.get(url) || { url,outcome: 'pending',checkedAt: null,error: null,listingFallback: false });
    const counts = (outcome: string) => pages.filter(page => page.outcome === outcome).length;
    const parsed = counts('parsed'),empty = counts('empty'),failed = counts('failed'),pending = counts('pending');
    const stale = !catalogRun || now - instant(catalogRun.started_at) > 2*hour;
    return { source,catalog: catalog.size,checked: pages.length - pending,parsed,empty,failed,pending,
      listingFallback: pages.filter(page => page.listingFallback).length,observedAt: catalogRun ? new Date(catalogRun.started_at).toISOString() : null,stale,
      verdict: !catalogRun ? 'untracked' : stale || pending || failed || empty || catalogRun.metrics.catalogComplete === false || ['failed','skipped'].includes(history.at(-1)?.status || '') ? 'needs_review' : 'checked',pages };
  });
  return { windowId: window.id, reason: window.reason || null, startedAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
    generatedAt: new Date(now).toISOString(), elapsedHours, totalHours: 168, expectedChecks: 672,
    elapsedExpectedChecks: elapsed.length, checked: checked.length, issues: issues.length,
    cadenceIssues: cadenceIssues.length,
    cadenceVerdict: now < end ? 'collecting' : cadenceIssues.length ? 'needs_review' : 'passed',
    verdict: now < end ? 'collecting' : issues.length ? 'needs_review' : 'passed', daily, rows,coverage };
}
export type ConcertMonitor = NonNullable<ReturnType<typeof buildConcertMonitor>> & { supplementalCoverage?: NonNullable<ReturnType<typeof buildConcertMonitor>>['coverage'] };
function csvCell(value: unknown) {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function concertMonitorCsv(report: ConcertMonitor) {
  const header = ['hour','source','scheduled_at','status','started_at','finished_at','late','items_seen','new_sources','discovered','attempted','fetch_failures','pending_catalog','error','listing_fallback'];
  return '\uFEFF' + [header, ...report.rows.map(row => [row.hour,row.source,row.scheduledAt,row.status,row.startedAt,row.finishedAt,row.late,row.seen,row.added,row.metrics.discovered,row.metrics.attempted,row.metrics.fetchFailures,row.metrics.pending,row.error,row.metrics.listingFallback])].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function concertCoverageCsv(report: ConcertMonitor) {
  const header = ['source','catalog_observed_at','url','outcome','checked_at','listing_only_fallback','error'];
  return '\uFEFF' + [header,...report.coverage.flatMap(source => source.pages.map(page => [source.source,source.observedAt,page.url,page.outcome,page.checkedAt,page.listingFallback,page.error]))]
    .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function concertMonitorMarkdown(report: ConcertMonitor) {
  const format = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const table = (rows: ConcertMonitor['coverage']) => '| Source | Catalog | Checked | Parsed | Empty/review | Failed | Pending | Listing fallback | State |\n|---|---:|---:|---:|---:|---:|---:|---:|---|\n' + rows.map(row => `| ${row.source} | ${row.catalog} | ${row.checked} | ${row.parsed} | ${row.empty} | ${row.failed} | ${row.pending} | ${row.listingFallback} | ${row.verdict} |`).join('\n');
  const coverage = '\n\n## Catalog page coverage — scheduled checks\n\nDistinct URLs in the latest observed catalog, using the latest page outcome within this monitoring window. Older runs without URL evidence are untracked; manual sweeps do not count. Empty means no parsable eligible event, not proof of no event. Parsed means the parser read a page, not a guarantee of factual completeness. Listing-only fallback is never full detail verification.\n\n' + table(report.coverage) + '\n\nDownload per-URL evidence: /api/status/concert-monitor.csv?view=coverage&windowId=' + report.windowId + '\n'
    + (report.supplementalCoverage ? '\n## Supplemental manual checks — excluded from cadence and scheduled coverage\n\n' + table(report.supplementalCoverage) + '\n\nDownload: /api/status/concert-monitor.csv?view=coverage&scope=manual&windowId=' + report.windowId + '\n' : '');
  return `# Concert update monitoring — 7 days\n\nWindow: ${format(report.startedAt)} – ${format(report.endsAt)} (Asia/Bangkok)\n\nGenerated: ${format(report.generatedAt)}\n\nCadence: **${report.cadenceVerdict}** (${report.cadenceIssues} unfinished/missing/late checks). Source results: **${report.verdict}**. Elapsed: ${report.elapsedHours}/168 complete hours. Source requests: ${report.checked}/${report.elapsedExpectedChecks}; issues: ${report.issues}.\n\nOnly scheduled worker cycles count. Manual sweeps and legacy runs are excluded. Future hours are not missing. Cadence requires a recorded attempt within each hour and a finished outcome; skipped rate-limited checks are recorded but not counted as source requests. Source failures are separate from a missed worker hour. A successful hourly check does not guarantee complete website coverage or instant publication. Items seen are parsed sessions; new sources count newly matched source identities, not changed fields. Ticketmelon rotates its catalog; pending catalog pages are distinct from request failures.\n\n| Day | Expected so far | Checked | Success | Partial | Failed | Missing | Running/skipped |\n|---|---:|---:|---:|---:|---:|---:|---:|\n` + report.daily.map(day => `| ${day.day} | ${day.expected} | ${day.checked} | ${day.success} | ${day.partial} | ${day.failed} | ${day.missing} | ${day.other} |`).join('\n') + '\n\nDownload the CSV for all 672 source/hour rows and their discovery metrics. Neither final verdict passes before the whole window finishes.\n' + coverage;
}
