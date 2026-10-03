import { primaryConcertSources } from './concert-types.js';

const hour = 3_600_000;
export type MonitorWindow = { id: string | number; started_at: string | Date; ends_at: string | Date };
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
      error: run?.error || null, metrics: run?.metrics || {} };
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
  return { windowId: window.id, startedAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(),
    generatedAt: new Date(now).toISOString(), elapsedHours, totalHours: 168, expectedChecks: 672,
    elapsedExpectedChecks: elapsed.length, checked: checked.length, issues: issues.length,
    cadenceIssues: cadenceIssues.length,
    cadenceVerdict: now < end ? 'collecting' : cadenceIssues.length ? 'needs_review' : 'passed',
    verdict: now < end ? 'collecting' : issues.length ? 'needs_review' : 'passed', daily, rows };
}
export type ConcertMonitor = NonNullable<ReturnType<typeof buildConcertMonitor>>;
function csvCell(value: unknown) {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function concertMonitorCsv(report: ConcertMonitor) {
  const header = ['hour','source','scheduled_at','status','started_at','finished_at','late','items_seen','new_sources','discovered','attempted','fetch_failures','pending_catalog','error'];
  return '\uFEFF' + [header, ...report.rows.map(row => [row.hour,row.source,row.scheduledAt,row.status,row.startedAt,row.finishedAt,row.late,row.seen,row.added,row.metrics.discovered,row.metrics.attempted,row.metrics.fetchFailures,row.metrics.pending,row.error])].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function concertMonitorMarkdown(report: ConcertMonitor) {
  const format = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  return `# Concert update monitoring — 7 days\n\nWindow: ${format(report.startedAt)} – ${format(report.endsAt)} (Asia/Bangkok)\n\nGenerated: ${format(report.generatedAt)}\n\nCadence: **${report.cadenceVerdict}** (${report.cadenceIssues} unfinished/missing/late checks). Source results: **${report.verdict}**. Elapsed: ${report.elapsedHours}/168 complete hours. Source requests: ${report.checked}/${report.elapsedExpectedChecks}; issues: ${report.issues}.\n\nOnly scheduled worker cycles count. Manual sweeps and legacy runs are excluded. Future hours are not missing. Cadence requires a recorded attempt within each hour and a finished outcome; skipped rate-limited checks are recorded but not counted as source requests. Source failures are separate from a missed worker hour. A successful hourly check does not guarantee complete website coverage or instant publication. Items seen are parsed sessions; new sources count newly matched source identities, not changed fields. Ticketmelon rotates its catalog; pending catalog pages are distinct from request failures.\n\n| Day | Expected so far | Checked | Success | Partial | Failed | Missing | Running/skipped |\n|---|---:|---:|---:|---:|---:|---:|---:|\n` + report.daily.map(day => `| ${day.day} | ${day.expected} | ${day.checked} | ${day.success} | ${day.partial} | ${day.failed} | ${day.missing} | ${day.other} |`).join('\n') + '\n\nDownload the CSV for all 672 source/hour rows and their discovery metrics. Neither final verdict passes before the whole window finishes.\n';
}
