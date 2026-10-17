export type InstagramEnrichmentJob = {
  needs_text:boolean;reason:string;requested_at:Date|string;id?:string;slug?:string;
};

export function instagramEnrichmentMode(job:InstagramEnrichmentJob,allowMedia:boolean):'detail'|'media' {
  // A full media response already contains captions. Periodic refresh jobs that
  // explicitly need text retain their existing text-only lane.
  return job.needs_text && (!allowMedia || job.reason==='refresh') ? 'detail' : 'media';
}

/** Caller supplies only jobs passing usage, deadline, spacing and backoff guards. */
export function chooseInstagramEnrichment<T extends InstagramEnrichmentJob>(jobs:T[],allowMedia:boolean,lastMode:string|null,contentSinceRefresh:number) {
  const refreshTurn=contentSinceRefresh>=2;
  const preferred=lastMode==='media'?'detail':lastMode==='detail'?'media':null;
  const rank=(job:T)=>(job.reason==='refresh')===refreshTurn?0:1;
  const sorted=[...jobs].sort((a,b)=>rank(a)-rank(b)
    || (preferred ? Number(instagramEnrichmentMode(a,allowMedia)!==preferred)-Number(instagramEnrichmentMode(b,allowMedia)!==preferred) : 0)
    || new Date(a.requested_at).getTime()-new Date(b.requested_at).getTime()
    || (a.id||a.slug||'').localeCompare(b.id||b.slug||''));
  return sorted[0]?{...sorted[0],mode:instagramEnrichmentMode(sorted[0],allowMedia)}:null;
}
