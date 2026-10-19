import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(readFileSync(path.join(root,'shared','templates-modern.json'),'utf8'));
const words=text=>new Set(String(text).toLowerCase().match(/[a-z]{4,}/g)||[]);
export function craftReferences(brief){
 const terms=words([brief.prompt,brief.style,brief.campaign?.objective,brief.brandContext?.business,brief.brandContext?.mission].filter(Boolean).join(' '));
 const curated=new Set(['studio-001','studio-011','studio-018','studio-079','studio-081','studio-082','studio-085','studio-088','studio-093','occasion-003','occasion-011','occasion-040']);
 const ranked=catalog.filter(t=>curated.has(t.id)).map(t=>({t,score:[...words(t.name+' '+t.occasion+' '+t.category)].filter(w=>terms.has(w)).length})).sort((a,b)=>b.score-a.score);
 return ranked.filter(r=>r.score>0).slice(0,2).flatMap(({t})=>{
  const relative=`modern-${t.id}.webp`;
  const file=[path.join(root,'public','templates',relative),path.join(root,'dist','templates',relative)].find(existsSync);
  return file?[{name:t.name,family:t.artDirection?.family,src:'data:image/webp;base64,'+readFileSync(file).toString('base64')}]:[];
 });
}
export const craftInstructions=`STUDIO CRAFT STANDARD
The client is commissioning finished graphic design. Establish an idea that can be recognized from the artwork without reading your explanation. Design the relationship between message and subject, not a stack of disconnected panels.
Make a two-second read: a clear first focal point, a purposeful second read, and supplied action/details. Let type have character through an appropriate family, scale contrast, line breaks and optical spacing. DM Sans is useful for clear supporting copy; Bricolage Grotesque supports expressive display; Instrument Serif supports editorial or ceremonial work. Choose by the client’s intent, never impose this pairing everywhere.
Use image crops, repeated structures, contrast, controlled asymmetry and alignment as communication devices. A background shape must group, frame or guide a real message; it is not proof of design effort. Do not attach a disconnected footer card, tiny pre-title, fake label or irrelevant badge to manufacture complexity. Empty space should make a focal point clearer, not expose an unfinished layout.
For campaigns, make each requested deliverable solve its own medium: distance legibility for signs, contact hierarchy for cards, thumb-stop recognition for social, a narrative sequence for pitches, atmosphere and complete event details for invitations. Shared identity is not permission to repeat the same composition on every page.
Respect the approved intent and scope in revisions. Improve the actual craft; never replace a successful concept just to make a different-looking output. Before returning, remove anything unsupported by the brief, make every required fact legible, and inspect alignment, crop, text fit and useful contrast. Return a complete editable composition, not your process notes.`;
