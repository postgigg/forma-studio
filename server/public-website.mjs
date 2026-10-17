import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

const private4 = new BlockList(), reserved6 = new BlockList(), global6 = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) private4.addSubnet(address,prefix);
global6.addSubnet('2000::',3,'ipv6');
for (const [address,prefix] of [['2001::',32],['2001:2::',48],['2001:db8::',32],['2001:10::',28],['2001:20::',28],['2002::',16]]) reserved6.addSubnet(address,prefix,'ipv6');
export function isPublicAddress(address) {
  const family=isIP(address);
  return family===4 ? !private4.check(address) : family===6 && global6.check(address,'ipv6') && !reserved6.check(address,'ipv6');
}
export function websiteAddress(value) {
  if(typeof value!=='string'||!value.trim()||value.length>2048) throw new Error('Enter your public business website.');
  let text=value.trim();
  if(!/^[a-z][\w+.-]*:/i.test(text)) text='https://'+text;
  let url;try{url=new URL(text);}catch{throw new Error('Enter a valid HTTP or HTTPS website address.');}
  const hostname=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||!hostname||hostname==='localhost'||/\.(localhost|local|internal|test|invalid)$/.test(hostname)||(isIP(hostname)&&!isPublicAddress(hostname))) throw new Error('Use a public HTTP or HTTPS website without credentials or a custom port.');
  url.hash='';return url;
}
export async function publicDestination(value,{resolve=lookup,signal}={}) {
  const url=websiteAddress(value),hostname=url.hostname.replace(/^\[|\]$/g,'');
  let timer,abort;
  const answers=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await Promise.race([resolve(hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The website address could not be resolved.')),5000);abort=()=>reject(new Error('Cancelled.'));signal?.addEventListener('abort',abort,{once:true});})]).finally(()=>{clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);});
  if(!answers.length||answers.some(answer=>!isPublicAddress(answer.address))) throw new Error('This address does not resolve to a public website.');
  if(signal?.aborted) throw new Error('Cancelled.');
  return {url,address:answers.find(answer=>answer.family===4)||answers[0]};
}
// Resolve and validate every redirect, then pin the socket to that exact public IP.
// No browser, scripts, cookies, credentials, subresources or proxy are involved.
export async function readPublicPage(value,{signal,resolve,request}={},redirects=0) {
  if(redirects>4) throw new Error('The website redirected too many times.');
  const {url,address}=await publicDestination(value,{resolve,signal});
  const result=await new Promise((resolveResult,reject)=>{
    const makeRequest=request||(url.protocol==='https:'?https.request:http.request);
    let deadline;
    const req=makeRequest(url,{method:'GET',agent:false,signal,headers:{'User-Agent':'FormaStudio/1.6 (public business information review)','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'},lookup(_host,options,callback){callback(null,options?.all?[address]:address.address,address.family);}},res=>{
      if([301,302,303,307,308].includes(res.statusCode)){const target=new URL(res.headers.location||'',url);res.destroy();if(url.protocol==='https:'&&target.protocol!=='https:')return reject(new Error('Use an HTTPS page or enter the details manually.'));return resolveResult({redirect:target.href});}
      if(res.statusCode!==200){res.resume();return reject(new Error(`The website returned ${res.statusCode}. Enter the details manually or try another public page.`));}
      if(!/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(res.headers['content-type']||'')||Number(res.headers['content-length'])>2_000_000||!['identity',undefined].includes(res.headers['content-encoding'])){res.resume();return reject(new Error('Choose a public HTML page under 2 MB.'));}
      let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>2_000_000){req.destroy(new Error('The website page is too large.'));return;}chunks.push(chunk);});
      res.on('end',()=>resolveResult({url:url.href,html:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);
    });
    deadline=setTimeout(()=>req.destroy(new Error('The website took too long to respond. Try another page or enter details manually.')),20000);req.once('close',()=>clearTimeout(deadline));req.setTimeout(15000,()=>req.destroy(new Error('The website took too long to respond. Try another page or enter details manually.')));req.on('error',reject);req.end();
  });
  return result.redirect?readPublicPage(result.redirect,{signal,resolve,request},redirects+1):result;
}
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function decode(text){return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(whole,name)=>{if(name[0]!=='#')return entities[name.toLowerCase()]||whole;const code=parseInt(name.slice(name[1].toLowerCase()==='x'?2:1),name[1].toLowerCase()==='x'?16:10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):' ';});}
export function pageContent({url,html}) {
  const stripped=html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg|nav|footer|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
  const plain=decode(stripped.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  const title=decode((html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]||'').replace(/<[^>]*>/g,' ')).trim().slice(0,200);
  const links=[];
  for(const match of stripped.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/gi)){
    try{const link=new URL(decode(match[1]),url);if(link.origin===new URL(url).origin&&/about|our-story|mission|who-we-are|services/i.test(link.pathname+' '+match[2])&&link.href!==url&&!links.includes(link.href))links.push(link.href);}catch{/* Invalid links are not fetched. */}
  }
  return {url,title,text:plain.slice(0,18000),links:links.slice(0,2)};
}
export async function collectWebsite(value,{signal,read=readPublicPage,onStage}={}){
  onStage?.('Reading your public website');const first=pageContent(await read(value,{signal}));
  if(first.text.length<80) throw new Error('This website does not expose enough readable text. Try its About page or enter the information manually.');
  const pages=[first],warnings=[];
  for(const link of first.links){if(signal?.aborted)throw new Error('Cancelled.');try{const next=pageContent(await read(link,{signal}));if(new URL(next.url).origin===new URL(first.url).origin&&!pages.some(page=>page.url===next.url)&&next.text.length>40)pages.push(next);}catch(error){if(signal?.aborted)throw error;warnings.push('An additional public page could not be read. Review the available details carefully.');}}
  return {url:first.url,pages:pages.map(({links,...page},i)=>({id:`page-${i+1}`,...page})),warnings:[...new Set(warnings)]};
}
