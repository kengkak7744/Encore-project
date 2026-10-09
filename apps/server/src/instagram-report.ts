import { config as loadEnv } from 'dotenv';
loadEnv({path:new URL('../../../.env',import.meta.url),quiet:true});
const {getInstagramMonitor}=await import('./instagram-monitor.js');
const {pool}=await import('./db.js');
try{console.log(JSON.stringify(await getInstagramMonitor(),null,2));}
finally{await pool.end();}
