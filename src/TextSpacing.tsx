import { useEffect, useRef } from 'react';
import { AlignCenter, AlignLeft, AlignRight, MoveVertical } from 'lucide-react';
import { Textbox } from 'fabric';
import { Editor } from './editor';
import { IconButton } from './ui';
export function TextSpacing({ editor, text }: { editor: Editor; text: Textbox }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) ref.current?.removeAttribute('open'); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && ref.current?.open) { ref.current.removeAttribute('open'); event.stopPropagation(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  return <details className="text-spacing" ref={ref}><summary aria-label="Text spacing"><MoveVertical size={17} /> Spacing</summary><div className="text-spacing-popover">
    <label className="field"><span>Line spacing</span><input aria-label="Quick line spacing" type="number" min={.5} max={4} step={.05} value={Math.round(text.lineHeight * 100) / 100} onChange={e => { const value = e.target.valueAsNumber; if (value >= .5 && value <= 4) editor.set({ lineHeight: value }); }} /></label>
    <label className="field"><span>Letter spacing · em</span><input aria-label="Quick letter spacing" type="number" min={-.2} max={1.5} step={.01} value={Math.round(text.charSpacing) / 1000} onChange={e => { const value = e.target.valueAsNumber; if (value >= -.2 && value <= 1.5) editor.set({ charSpacing: Math.round(value * 1000) }); }} /></label>
    <div className="text-align-buttons">{([{ icon: AlignLeft, value: 'left' }, { icon: AlignCenter, value: 'center' }, { icon: AlignRight, value: 'right' }] as const).map(({ icon, value }) => <IconButton key={value} icon={icon} label={`Quick align text ${value}`} active={text.textAlign === value} onClick={() => editor.set({ textAlign: value })} />)}</div>
  </div></details>;
}
