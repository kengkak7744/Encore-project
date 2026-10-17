import {mkdir,writeFile,link,unlink} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {concertAcceptanceSummary} from './concert-acceptance.js';
import type {ConcertMonitor} from './concert-monitor.js';

/** Archive the first complete post-window snapshot, including failed acceptance. */
export async function archiveFinalConcertReport(report:ConcertMonitor,directory:string,now=Date.now()) {
  const summary=concertAcceptanceSummary(report,now);
  if(!summary.finalSnapshotAllowed)return null;
  const id=String(report.windowId);
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Error('Invalid concert monitoring window ID');
  await mkdir(directory,{recursive:true});
  const path=join(directory,`concert-window${id}-final.json`);
  const temporary=join(directory,`.concert-window${id}-final.${randomUUID()}.tmp`);
  const evidence={...summary,sha256:createHash('sha256').update(JSON.stringify(report)).digest('hex'),report};
  await writeFile(temporary,JSON.stringify(evidence,null,2),{encoding:'utf8',flag:'wx'});
  try {
    // The link becomes visible only after the entire temporary file is written.
    // Its exclusive target creation preserves the first snapshot across races/restarts.
    await link(temporary,path);
    return {path,created:true};
  }catch(error){
    if((error as NodeJS.ErrnoException).code==='EEXIST')return {path,created:false};
    throw error;
  }finally{await unlink(temporary);}
}
