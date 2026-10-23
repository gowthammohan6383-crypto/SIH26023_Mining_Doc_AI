import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Archive, ArrowDownToLine, BarChart3, CheckCircle2, ChevronRight, ClipboardList, FileText, FolderOpen, Gem, HardDriveUpload, Search, ShieldCheck, Sparkles, X } from 'lucide-react';

const API = 'http://127.0.0.1:8000/api';
const fmt = (s) => { try { return new Date(s).toLocaleDateString(); } catch { return s; } };

export default function App() {
  const [docs, setDocs] = useState([]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('Overview');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState(null);
  const [apiOk, setApiOk] = useState(false);

  async function loadDocs(q = query) {
    try {
      const r = await fetch(`${API}/documents${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (!r.ok) throw new Error('API unavailable');
      const data = await r.json(); setDocs(data.documents); setApiOk(true);
    } catch { setApiOk(false); }
  }
  useEffect(() => { loadDocs(''); fetch(`${API}/health`).then(r => setApiOk(r.ok)).catch(() => setApiOk(false)); }, []);
  useEffect(() => { const t = setTimeout(() => loadDocs(query), 250); return () => clearTimeout(t); }, [query]);

  async function upload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setNotice('');
    try {
      const form = new FormData(); form.append('file', file);
      const r = await fetch(`${API}/documents`, { method: 'POST', body: form });
      const data = await r.json(); if (!r.ok) throw new Error(data.detail || 'Upload failed');
      setNotice(`Successfully analyzed ${data.filename}`); setSelected(s => [...s, data.id]); await loadDocs('');
    } catch (err) { setNotice(`${err.message}. Check that the Python backend is running.`); }
    finally { setBusy(false); e.target.value = ''; }
  }

  const totalWords = useMemo(() => docs.reduce((n,d) => n + (d.extracted?.word_count || 0), 0), [docs]);
  const mineralCount = useMemo(() => new Set(docs.flatMap(d => d.extracted?.minerals || [])).size, [docs]);
  const selectedDocs = docs.filter(d => selected.includes(d.id));
  function toggle(id) { setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]); }

  async function downloadReport() {
    try {
      const r = await fetch(`${API}/report`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({document_ids: selected}) });
      const data = await r.json(); if (!r.ok) throw new Error(data.detail);
      const blob = new Blob([data.report], {type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = data.filename; a.click(); URL.revokeObjectURL(url);
      setNotice('Report generated and downloaded.');
    } catch (e) { setNotice(e.message || 'Could not generate report.'); }
  }
  async function compare() {
    try {
      const r = await fetch(`${API}/compare`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document_ids:selected})});
      const data = await r.json(); if (!r.ok) throw new Error(data.detail);
      setDetail({title:'Historical comparison', comparison:data.reports});
    } catch(e) { setNotice(e.message || 'Choose at least two documents to compare.'); }
  }

  const nav = [
    {name:'Overview', icon:BarChart3}, {name:'Documents', icon:FolderOpen}, {name:'Compare reports', icon:Activity}
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Gem size={22}/></div><div><b>MineIntel</b><span>DOCUMENT AI</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      {nav.map(n => <button key={n.name} onClick={() => setActive(n.name)} className={`nav-item ${active===n.name?'active':''}`}><n.icon size={18}/><span>{n.name}</span>{n.name==='Documents' && <small>{docs.length}</small>}</button>)}
      <div className="side-bottom"><div className="secure-icon"><ShieldCheck size={18}/></div><div><b>Private workspace</b><span>Files stay in your local setup</span></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <ChevronRight size={14}/> <b>{active}</b></div><div className={`status ${apiOk?'online':'offline'}`}><span/>{apiOk?'API connected':'Backend offline'}</div></header>
      <section className="welcome"><div><div className="eyebrow"><Sparkles size={14}/> MINING INTELLIGENCE PLATFORM</div><h1>Mining data, made <em>discoverable.</em></h1><p>Upload technical reports, extract key findings, and compare historical records in one workspace.</p></div>
        <label className={`upload-button ${busy?'disabled':''}`}><HardDriveUpload size={17}/>{busy?'Analyzing...':'Upload document'}<input type="file" accept=".pdf,.docx,.txt,.csv" onChange={upload} disabled={busy}/></label>
      </section>
      {notice && <div className="notice"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
      {active==='Overview' && <>
        <div className="stats-grid">
          <Stat icon={Archive} label="Documents indexed" value={docs.length} note="Reports in workspace"/>
          <Stat icon={ClipboardList} label="Words processed" value={totalWords.toLocaleString()} note="Extracted searchable text"/>
          <Stat icon={Gem} label="Mineral types found" value={mineralCount} note="Across uploaded reports"/>
          <Stat icon={CheckCircle2} label="Search status" value={apiOk?'Ready':'Offline'} note={apiOk?'Index is responding':'Start the backend'} />
        </div>
        <div className="section-heading"><div><h2>Recent documents</h2><p>Latest reports added to your workspace</p></div><button className="text-button" onClick={()=>setActive('Documents')}>View all <ChevronRight size={15}/></button></div>
        <DocumentTable docs={docs.slice(0,5)} selected={selected} toggle={toggle} open={setDetail}/>
        <div className="bottom-grid"><div className="panel insight-panel"><div className="panel-title"><Sparkles size={17}/><h3>Extraction overview</h3></div><p>MineIntel identifies common mineral names, dates, measured quantities, and repeated keywords from uploaded text.</p><div className="mini-bars">{[['Minerals',docs.filter(d=>d.extracted?.minerals?.length).length],['Dates',docs.filter(d=>d.extracted?.dates?.length).length],['Quantities',docs.filter(d=>d.extracted?.quantities?.length).length]].map(([label,val])=><div className="bar-row" key={label}><span>{label}</span><div className="bar-track"><div style={{width:`${docs.length?Math.max(5,val/docs.length*100):0}%`}}/></div><b>{val}</b></div>)}</div></div>
          <div className="panel quick-panel"><div className="panel-title"><FileText size={17}/><h3>Quick actions</h3></div><button onClick={()=>document.getElementById('quick-upload').click()}><HardDriveUpload size={17}/><span><b>Analyze a new report</b><small>PDF, DOCX, TXT or CSV</small></span><ChevronRight size={16}/></button><input id="quick-upload" type="file" hidden accept=".pdf,.docx,.txt,.csv" onChange={upload}/><button onClick={()=>setActive('Compare reports')}><BarChart3 size={17}/><span><b>Compare historical data</b><small>Review extracted fields side by side</small></span><ChevronRight size={16}/></button></div></div>
      </>}
      {active==='Documents' && <><div className="section-heading doc-heading"><div><h2>Document library</h2><p>Search and manage your uploaded mining reports</p></div></div><div className="search-row"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search filenames, minerals, report content..."/><span>{docs.length} results</span></div><DocumentTable docs={docs} selected={selected} toggle={toggle} open={setDetail}/></>}
      {active==='Compare reports' && <><div className="section-heading doc-heading"><div><h2>Historical comparison</h2><p>Select two or more reports to compare extracted information.</p></div><button className="primary-small" onClick={compare}>Compare selected ({selected.length})</button></div><div className="compare-list">{docs.map(d=><label key={d.id} className="compare-item"><input type="checkbox" checked={selected.includes(d.id)} onChange={()=>toggle(d.id)}/><div className="file-icon"><FileText size={18}/></div><div className="compare-info"><b>{d.filename}</b><span>{d.file_type} · {fmt(d.uploaded_at)}</span></div><span className="mineral-tags">{(d.extracted?.minerals||[]).slice(0,2).join(', ')||'No minerals detected'}</span></label>)}</div><p className="helper-text">Tip: Select reports from different dates to compare historical findings. Detected values are heuristic and should be verified.</p></>}
      <footer><span>MineIntel <b>·</b> SIH26023 prototype</span><span>AI-assisted document review <span className="footer-dot">●</span></span></footer>
    </main>
    {selected.length>0 && <div className="selection-bar"><div><b>{selected.length} selected</b><span>Ready for analysis</span></div><button onClick={compare}>Compare <BarChart3 size={16}/></button><button className="download-action" onClick={downloadReport}>Generate report <ArrowDownToLine size={16}/></button><button className="clear-action" onClick={()=>setSelected([])} aria-label="Clear selection"><X size={17}/></button></div>}
    {detail && <div className="modal-backdrop" onClick={()=>setDetail(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">DOCUMENT DETAILS</span><h2>{detail.title || detail.filename}</h2></div><button onClick={()=>setDetail(null)}><X/></button></div>{detail.comparison ? <div className="comparison-grid">{detail.comparison.map(d=><div className="compare-card" key={d.id}><h3>{d.filename}</h3><small>{fmt(d.uploaded_at)}</small><Metric label="Minerals" value={d.extracted.minerals?.join(', ')||'—'}/><Metric label="Dates detected" value={d.extracted.dates?.join(', ')||'—'}/><Metric label="Quantities" value={d.extracted.quantities?.join(', ')||'—'}/><Metric label="Word count" value={d.extracted.word_count}/><Metric label="Keywords" value={d.extracted.keywords?.join(', ')||'—'}/></div>)}</div> : <><div className="detail-stats"><Metric label="File type" value={detail.file_type}/><Metric label="Word count" value={detail.extracted?.word_count}/><Metric label="Minerals" value={detail.extracted?.minerals?.join(', ')||'—'}/><Metric label="Dates" value={detail.extracted?.dates?.join(', ')||'—'}/><Metric label="Quantities" value={detail.extracted?.quantities?.join(', ')||'—'}/><Metric label="Keywords" value={detail.extracted?.keywords?.join(', ')||'—'}/></div><h3 className="preview-title">Extracted text</h3><pre className="preview">{detail.content || detail.preview || 'No preview available'}</pre></>}</div></div>}
  </div>;
}
function Stat({icon:Icon,label,value,note}) { return <div className="stat-card"><div className="stat-top"><span>{label}</span><div><Icon size={18}/></div></div><strong>{value}</strong><small>{note}</small></div>; }
function Metric({label,value}) { return <div className="metric"><span>{label}</span><b>{value ?? '—'}</b></div>; }
function DocumentTable({docs,selected,toggle,open}) {
  if (!docs.length) return <div className="empty-state"><div><FolderOpen size={25}/></div><h3>No documents yet</h3><p>Upload a mining report to start extracting information.</p></div>;
  return <div className="table-wrap"><table><thead><tr><th></th><th>DOCUMENT</th><th>TYPE</th><th>MINERALS</th><th>UPLOADED</th><th></th></tr></thead><tbody>{docs.map(d=><tr key={d.id}><td><input type="checkbox" checked={selected.includes(d.id)} onChange={()=>toggle(d.id)}/></td><td><button className="file-cell" onClick={()=>open({...d,title:d.filename})}><span className="file-icon"><FileText size={17}/></span><span><b>{d.filename}</b><small>{d.extracted?.word_count||0} words indexed</small></span></button></td><td><span className="type-pill">{d.file_type}</span></td><td><div className="tags">{(d.extracted?.minerals||[]).slice(0,2).map(m=><span key={m}>{m}</span>)}{!d.extracted?.minerals?.length&&<span className="muted-tag">Not detected</span>}</div></td><td className="date-cell">{fmt(d.uploaded_at)}</td><td><button className="open-btn" onClick={()=>open({...d,title:d.filename})}>Open <ChevronRight size={14}/></button></td></tr>)}</tbody></table></div>;
}
