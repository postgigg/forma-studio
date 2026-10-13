from pathlib import Path
root = Path(__file__).resolve().parents[1]
def change(file, old, new):
    p = root / file
    s = p.read_text(encoding='utf-8')
    if old not in s: raise ValueError(f'Anchor not found: {file}: {old[:80]}')
    p.write_text(s.replace(old, new, 1), encoding='utf-8')

p=root/'src/App.tsx'
s=p.read_text(encoding='utf-8')
start=s.index('                  <div className="top-zoom">')
end=s.index('                  <span className="toolbar-divider" />',start)
zoom=s[start:end]
s=s[:start]+s[end:]
start=s.index('                  <button\n                    className="zoom-value"')
end=s.index('                  <IconButton',start)
select=zoom[zoom.index('                    <select'):zoom.index('                    <IconButton',zoom.index('</select>'))]
s=s[:start]+select+s[end:]
s=s.replace('label="Zoom out"','label="Zoom canvas out"').replace('label="Zoom in"','label="Zoom canvas in"')
s=s.replace('max={150}', 'max={200}')
s=s.replace('    [dialog, setDialog]', '    [pagesOpen, setPagesOpen] = useState(() => localStorage.getItem("forma:pages-open") !== "false"),\n    [dialog, setDialog]',1)
s=s.replace('<div className="artboard" aria-label="Editable design canvas">', '<div className="artboard" aria-label="Editable design canvas" style={ready ? {width: editor.doc.width * editor.zoom, height: editor.doc.height * editor.zoom} : undefined}>')
s=s.replace('<div className="page-tray">','<div className="page-tray" id="page-thumbnails" hidden={!pagesOpen}>')
s=s.replace('<span className="footer-page">','<button className="footer-page page-tray-toggle" aria-label={pagesOpen ? "Hide page thumbnails" : "Show page thumbnails"} aria-expanded={pagesOpen} aria-controls="page-thumbnails" onClick={() => { const next = !pagesOpen; setPagesOpen(next); localStorage.setItem("forma:pages-open", String(next)); }}>')
s=s.replace('{editor.doc.pages.length}\n                </span>', '{editor.doc.pages.length}\n                  <ChevronDown size={13} style={{transform: pagesOpen ? "none" : "rotate(180deg)"}} />\n                </button>')
p.write_text(s,encoding='utf-8')

p=root/'src/Sidebar.tsx'
s=p.read_text(encoding='utf-8')
start=s.index('      <div className="panel-bottom">')
end=s.index('      </div>',start)+len('      </div>')
s=s[:start]+s[end:]
p.write_text(s,encoding='utf-8')

p=root/'src/DesignerPanel.tsx'
s=p.read_text(encoding='utf-8')
s=s.replace('  const panelRef =', '  const [view, setView] = useState<"create" | "results">(() => sessionStorage.getItem("forma:ai-job") ? "results" : "create");\n  const panelRef =')
s=s.replace('  const newDesign = () => {', '  const newDesign = () => {\n    setView("create");')
s=s.replace('    if (reference) {', '    if (reference) {\n      setView("create");',1)
s=s.replace('      setJobId(result.id);', '      setJobId(result.id);\n      setView("results");',1)
start=s.index('      {recent.length > 0 && (')
end=s.index('      <label className="field ai-brief">',start)
recent=s[start:end]
s=s[:start]+s[end:]
s=s.replace('      <button\n        className="secondary full ai-new-design"', '      <div className="ai-view-tabs" role="tablist" aria-label="AI designer views">\n        <button role="tab" aria-selected={view === "create"} onClick={() => setView("create")}>Create</button>\n        <button role="tab" aria-selected={view === "results"} onClick={() => setView("results")}>Results & history</button>\n      </div>\n      {view === "create" && <>\n      <button\n        className="secondary full ai-new-design"',1)
start=s.index('      {!busy ? (')
mid=s.index('        <div className="ai-progress">',start)
s=s[:start]+s[start:mid].replace('{!busy ? (','{!busy && (').replace('      ) : (','      )}\n      </>}\n      {view === "results" && <>\n'+recent+'      {!busy && <button className="secondary full" onClick={newDesign}><Plus size={16} /> New AI design</button>}\n      {busy && (')+s[mid:]
start=s.index('      {error && (')
end=s.index('      {draft && proposal && (',start)
error=s[start:end]
s=s[:start]+s[end:]
s=s.replace('      <div className="ai-connection">', '      {!draft && !busy && <p className="muted">Choose a recent design to view its editable result.</p>}\n      {draft && <button className="secondary full" onClick={() => setView("create")}><RefreshCw size={15} /> Refine this design</button>}\n      </>}\n'+error+'      <div className="ai-connection">',1)
p.write_text(s,encoding='utf-8')
