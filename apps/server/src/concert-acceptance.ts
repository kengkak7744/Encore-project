import type { ConcertMonitor } from './concert-monitor.js';
import { primaryConcertSources } from './concert-types.js';

/** A final snapshot may report failure; elapsed hours alone never prove coverage. */
export function concertAcceptanceSummary(report: ConcertMonitor,now = Date.now()) {
  const start = Date.parse(report.startedAt),end = Date.parse(report.endsAt),generated = Date.parse(report.generatedAt);
  if (![start,end,generated,now].every(Number.isFinite) || end-start !== 168*3_600_000) throw Error('Invalid seven-day monitoring window');
  if (generated > now+60_000) throw Error('Report timestamp is ahead of the observation clock');
  const expectedRows = new Set(primaryConcertSources.flatMap(source => Array.from({length:168},(_unused,index) =>
    `${source}|${new Date(start+index*3_600_000).toISOString()}`)));
  const actualRows = new Set(report.rows.map(row => `${row.source}|${row.scheduledAt}`));
  const validRows = report.rows.length === 672 && actualRows.size === 672 && [...actualRows].every(key => expectedRows.has(key));
  const completed = report.rows.filter(row => {
    if (!row.startedAt || !row.finishedAt || row.late || !['success','partial','failed'].includes(row.status)) return false;
    const scheduled=Date.parse(row.scheduledAt),started=Date.parse(row.startedAt),finished=Date.parse(row.finishedAt);
    return [scheduled,started,finished].every(Number.isFinite) && started>=scheduled && started<scheduled+3_600_000 && finished>=started && finished<=now;
  });
  const windowFinished = now >= end && generated >= end;
  const cadencePassed = windowFinished && validRows && completed.length === 672 && report.cadenceIssues === 0;
  const coverage = primaryConcertSources.map(source => {
    const row = report.coverage.find(item => item.source === source);
    return {source,catalog:row?.catalog ?? 0,parsed:row?.parsed ?? 0,empty:row?.empty ?? 0,
      failed:row?.failed ?? 0,pending:row?.pending ?? 0,listingFallback:row?.listingFallback ?? 0,
      verdict:row?.verdict ?? 'untracked',
      requiresReview:!row || row.verdict !== 'checked' || row.empty>0 || row.failed>0 || row.pending>0 || row.listingFallback>0};
  });
  const uniqueCoverage = report.coverage.length === primaryConcertSources.length && new Set(report.coverage.map(row => row.source)).size === primaryConcertSources.length;
  const sourceResultsPassed = cadencePassed && uniqueCoverage && report.issues === 0 && report.rows.every(row => row.status==='success') && coverage.every(row => !row.requiresReview);
  return {windowId:report.windowId,startedAt:report.startedAt,endsAt:report.endsAt,generatedAt:report.generatedAt,
    finalSnapshotAllowed:windowFinished,validRows,completedChecks:completed.length,expectedChecks:672,
    cadence:!windowFinished?'collecting':cadencePassed?'passed':'needs_review',
    sourceResults:!windowFinished?'collecting':sourceResultsPassed?'passed':'needs_review',coverage,
    factualCompleteness:'requires source-by-source review; parsed pages do not verify every field'};
}
