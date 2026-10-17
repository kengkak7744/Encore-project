import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {concertAcceptanceSummary} from './concert-acceptance.js';
import {concertMonitorCsv,concertMonitorMarkdown,concertCoverageCsv,type ConcertMonitor} from './concert-monitor.js';

async function main() {
  // Database-only public reporting endpoint: this never starts a sync or provider request.
  const response=await fetch('http://localhost:3000/api/status/concert-monitor?windowId=2',{signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw Error('Monitor endpoint HTTP '+response.status);
  const payload=await response.json() as {report?:ConcertMonitor};
  const report=payload.report;
  if(!report || String(report.windowId)!=='2' || report.endsAt!=='2026-10-11T23:00:00.000Z')throw Error('Original window2/end does not match; no report written');
  const summary=concertAcceptanceSummary(report);
  const final=process.argv.includes('--final');
  if(final && !summary.finalSnapshotAllowed)throw Error('Original window ends 12 Oct 2026 06:00 Asia/Bangkok; final snapshot is not available yet');
  const directory=fileURLToPath(new URL('../../../.local/concert-reports/',import.meta.url));
  await mkdir(directory,{recursive:true});
  const stem=final?'concert-window2-final-'+report.generatedAt.replaceAll(':','-'):'concert-window2-readiness';
  const evidence={...summary,sha256:createHash('sha256').update(JSON.stringify(report)).digest('hex'),report};
  for(const [extension,body]of [
    ['json',JSON.stringify(evidence,null,2)],['md',concertMonitorMarkdown(report)],
    ['csv',concertMonitorCsv(report)],['coverage.csv',concertCoverageCsv(report)]
  ])await writeFile(join(directory,stem+'.'+extension),body,{encoding:'utf8',flag:final?'wx':'w'});
  console.log(JSON.stringify({...summary,directory,stem},null,2));
}

await main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
