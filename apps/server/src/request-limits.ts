import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';

// Forwarding headers are deliberately not trusted. Logged-in quotas belong to
// the authenticated user; auth attempts also distinguish the submitted account.
export function requestLimits(): RequestHandler {
  const buckets = new Map<string,{count:number;until:number}>();
  function consume(key: string,limit: number,now: number) {
    const old=buckets.get(key),entry=old&&old.until>now?old:{count:0,until:now+60000};
    entry.count++;buckets.set(key,entry);return entry.count<=limit;
  }
  return (req,res,next) => {
    const auth=req.path.startsWith('/api/auth/');
    if (!auth && !['/api/chat','/api/trip-estimates'].includes(req.path) && !(req.method==='POST'&&req.path.startsWith('/api/maps/'))) { next();return; }
    const now=Date.now();
    if(buckets.size>1000)for(const[key,value]of buckets)if(value.until<=now)buckets.delete(key);
    const network=req.ip || 'unknown';
    const email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase().slice(0,320):'';
    const account=auth&&email?'account:'+createHash('sha256').update(email).digest('hex'):res.locals.user?'user:'+res.locals.user.id:'network:'+network;
    const allowed=(!auth||consume('auth-network:'+network,200,now))&&consume(account+':'+req.path,req.path==='/api/trip-estimates'?5:20,now);
    if(!allowed){res.setHeader('Retry-After','60');res.status(429).json({error:'ส่งคำขอมากเกินไป กรุณารอสักครู่'});return;}
    next();
  };
}
