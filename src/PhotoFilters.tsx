import { useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Field } from './ui';
import type { Editor } from './editor';
import { photoGrades, validGrades, type GradedImage } from './photo-filters';

export function PhotoFilters({ editor, image }: { editor: Editor; image: GradedImage }) {
  const [family, setFamily] = useState('All');
  const layers = validGrades(image.photoGrades);
  const change = (next: typeof layers) => editor.setPhotoGrades(next);
  return <div className="photo-filter-controls">
    <div className="section-heading"><h4>Photo filters</h4><button className="text-button" onClick={() => editor.imageFilter('original')}>Reset</button></div>
    <Field label="Filter collection"><select value={family} onChange={e => setFamily(e.target.value)} aria-label="Filter collection">
      {['All', ...new Set(photoGrades.map(g => g.family))].map(f => <option key={f}>{f}</option>)}
    </select></Field>
    <div className="filter-grid" aria-label="Photo filters">
      {photoGrades.filter(g => family === 'All' || g.family === family).map(g => <button key={g.id} disabled={layers.length >= 6} onClick={() => change([...layers,{id:g.id,amount:1}])}>{g.name}</button>)}
    </div>
    {!!layers.length && <ol className="photo-grade-stack" aria-label="Applied filters">
      {layers.map((g,i) => <li key={`${i}-${g.id}`}><div><strong>{photoGrades.find(p => p.id === g.id)!.name}</strong>
        <button aria-label={`Move filter ${i+1} up`} disabled={i===0} onClick={() => { const n=[...layers]; [n[i-1],n[i]]=[n[i],n[i-1]];change(n); }}><ChevronUp size={14}/></button>
        <button aria-label={`Move filter ${i+1} down`} disabled={i===layers.length-1} onClick={() => { const n=[...layers]; [n[i+1],n[i]]=[n[i],n[i+1]];change(n); }}><ChevronDown size={14}/></button>
        <button aria-label={`Remove filter ${i+1}`} onClick={() => change(layers.filter((_,k)=>k!==i))}><X size={14}/></button></div>
        <label>Strength <input type="range" aria-label={`Filter ${i+1} strength`} min={0} max={100} value={Math.round(g.amount*100)} onChange={e=>change(layers.map((v,k)=>k===i?{...v,amount:+e.target.value/100}:v))}/><output>{Math.round(g.amount*100)}%</output></label>
      </li>)}
    </ol>}
    <Field label="Brightness"><input type="range" aria-label="Brightness" min={-.5} max={.5} step={.01} value={image.photoBrightness ?? (image.filters.find(f=>f.type==='Brightness') as {brightness?:number})?.brightness ?? 0} onChange={e=>editor.brightness(+e.target.value)}/></Field>
  </div>;
}
