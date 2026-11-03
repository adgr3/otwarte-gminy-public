/**
 * OG-V1 ROUTE-OVERLAY READINESS — GET-only, no mutations, no deployments.
 * This does NOT authorise cutover and never returns cutoverAllowed=true.
 *
 * Inputs: CLOUDFLARE_PREFLIGHT_TOKEN, CLOUDFLARE_ACCOUNT_ID.
 * Output: public-route-readiness.json (sanitised; no token or Tunnel UUID).
 */
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {TARGET, ZONE, SCRIPT, checkRouteOverlay, getProposedRoute} from './cf-route-overlay-rules.mjs';

const token=process.env.CLOUDFLARE_PREFLIGHT_TOKEN??'';
const account=process.env.CLOUDFLARE_ACCOUNT_ID??'';
const sha=(value)=>createHash('sha256').update(String(value)).digest('hex');
const report={
 schema:'og.route.readiness.v1',capturedAt:new Date().toISOString(),
 host:TARGET,zone:ZONE,proposed:getProposedRoute(),
 checks:{},blockers:[],readyForRouteReview:false,cutoverAllowed:false,
 productionUnchanged:true,
};
function writeReport(){
 writeFileSync('public-route-readiness.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}
async function request(name,fn){
 try{
  const data=await fn();report.checks[name]={ok:true};return data;
 }catch(error){
  report.checks[name]={ok:false,error:String(error.message??error)};
  report.blockers.push(`${name}: ${String(error.message??error)}`);
  return null;
 }
}
async function cloudflare(path){
 const r=await fetch('https://api.cloudflare.com/client/v4'+path,{
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  signal:AbortSignal.timeout(20000)
 });
 const body=await r.json().catch(()=>({}));
 if(!r.ok||body.success===false)throw new Error(`Cloudflare HTTP ${r.status}; error codes ${JSON.stringify((body.errors??[]).map(e=>e.code))}`);
 return body.result;
}
if(!token||!account){
 report.blockers.push('Missing read-only CLOUDFLARE_PREFLIGHT_TOKEN or CLOUDFLARE_ACCOUNT_ID');
 writeReport();process.exit(1);
}
const zones=await request('zone',()=>cloudflare('/zones?name='+encodeURIComponent(ZONE)));
const zone=Array.isArray(zones)?zones.find(z=>z.name===ZONE&&z.status==='active'):null;
if(!zone?.id)report.blockers.push('Exactly named active Cloudflare zone not found.');
if(zone?.id && zone.account?.id !== account)report.blockers.push('Cloudflare zone belongs to a different account than CLOUDFLARE_ACCOUNT_ID.');
if(zone?.id){
 report.zoneId=zone.id;
 const [dns,routes,domains,scripts]=await Promise.all([
  request('dns',()=>cloudflare(`/zones/${zone.id}/dns_records?name=${encodeURIComponent(TARGET)}`)),
  request('routes',()=>cloudflare(`/zones/${zone.id}/workers/routes`)),
  request('customDomains',()=>cloudflare(`/accounts/${account}/workers/domains`)),
  request('workerScripts',()=>cloudflare(`/accounts/${account}/workers/scripts`))
 ]);
 if(Array.isArray(dns)){
  report.dnsSummary=dns.map(r=>({
   id:r.id,name:r.name,type:r.type,proxied:r.proxied,ttl:r.ttl,
   targetSha256:sha(r.content??''),tunnelTarget:/\.cfargotunnel\.com\.?$/i.test(r.content??'')
  }));
  report.dnsFingerprint=sha(JSON.stringify(report.dnsSummary));
 }
 if(Array.isArray(routes))report.routeSummary=routes.map(r=>({id:r.id,pattern:r.pattern,script:r.script??null}));
 if(Array.isArray(domains))report.targetCustomDomains=domains.filter(d=>d.hostname===TARGET).map(d=>({id:d.id,service:d.service}));
 if(Array.isArray(scripts)){
  report.targetWorker={name:SCRIPT,present:scripts.some(w=>w.id===SCRIPT||w.name===SCRIPT)};
 }else report.blockers.push('Cannot verify existence of the target Worker script.');
 const check=checkRouteOverlay({dns,routes,customDomains:domains,host:TARGET,zoneName:ZONE});
 report.blockers.push(...check.blockers);
}
const origin=await request('existingProduction',async()=>{
 const response=await fetch('https://'+TARGET+'/',{
  method:'GET',redirect:'manual',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)
 });
 const xPoweredBy=response.headers.get('x-powered-by');
 const meta={status:response.status,framework:xPoweredBy??'not-supplied',contentType:response.headers.get('content-type')};
 await response.body?.cancel().catch(()=>{});
 if(response.status!==200)throw new Error('Existing production did not answer HTTP 200');
 if(!/^Next\.js/i.test(xPoweredBy??''))throw new Error('Existing production Next.js identity not confirmed; inspect before route cutover');
 return meta;
});
if(origin)report.origin=origin;
report.readyForRouteReview=report.blockers.length===0&&Object.values(report.checks).every(x=>x.ok);
report.cutoverAllowed=false; // Operator's separate future approval required, always.
report.rollbackPlan={
 before:'Preserve existing proxied Tunnel CNAME, current origin and its DNS fingerprint. No DNS mutation.',
 onFailure:'Delete ONLY the newly created Worker Route by its recorded Cloudflare route id, then prove Next.js origin and exact DNS fingerprint again.',
 never:'Never delete the Tunnel CNAME or modify apex/www; do not use the old custom-domain config.',
};
writeReport();
if(!report.readyForRouteReview)process.exit(2);
console.log('ROUTE_READINESS=PASS (read-only review; NO cutover authorised)');
