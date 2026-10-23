from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
from typing import Optional
import sqlite3, re, json, uuid
from datetime import datetime

BASE = Path(__file__).parent
UPLOAD_DIR = BASE / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
DB = BASE / "mining_docs.db"

app = FastAPI(title="Mining Document Intelligence API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

def connect():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    with connect() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY, filename TEXT, file_type TEXT, uploaded_at TEXT,
            content TEXT, extracted TEXT
        )""")
init_db()

def extract_text(path: Path, suffix: str) -> str:
    try:
        if suffix == ".txt":
            return path.read_text(encoding="utf-8", errors="ignore")
        if suffix == ".csv":
            return path.read_text(encoding="utf-8", errors="ignore")
        if suffix == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        if suffix == ".docx":
            from docx import Document
            doc = Document(str(path))
            return "\n".join(p.text for p in doc.paragraphs)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read document: {exc}")
    return ""

def extract_fields(content: str):
    # Lightweight baseline NLP; replace with a trained NER model for production.
    dates = re.findall(r'\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b', content)
    quantities = re.findall(r'\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:tonnes?|tons?|kg|m3|m³|metres?|meters?|%|ppm)\b', content, re.I)
    minerals_vocab = ["coal", "iron ore", "limestone", "bauxite", "copper", "gold", "manganese", "granite", "silica"]
    low = content.lower()
    minerals = [m for m in minerals_vocab if m in low]
    keywords = re.findall(r'\b[a-zA-Z][a-zA-Z-]{3,}\b', content.lower())
    stop = {"there", "which", "their", "about", "report", "these", "those", "mining", "with", "from", "that", "this"}
    freq = {}
    for word in keywords:
        if word not in stop:
            freq[word] = freq.get(word, 0) + 1
    top_keywords = [w for w, _ in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:8]]
    return {
        "dates": list(dict.fromkeys(dates))[:20],
        "quantities": list(dict.fromkeys(quantities))[:30],
        "minerals": minerals,
        "keywords": top_keywords,
        "word_count": len(content.split()),
        "characters": len(content)
    }

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Mining Document Intelligence"}

@app.post("/api/documents")
async def upload_document(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".pdf", ".docx", ".txt", ".csv"}:
        raise HTTPException(status_code=415, detail="Supported formats: PDF, DOCX, TXT, CSV")
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Maximum file size is 15 MB")
    safe_name = Path(file.filename).name
    doc_id = str(uuid.uuid4())
    stored = UPLOAD_DIR / f"{doc_id}{suffix}"
    stored.write_bytes(raw)
    content = extract_text(stored, suffix)
    extracted = extract_fields(content)
    uploaded_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    with connect() as con:
        con.execute("INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)",
                    (doc_id, safe_name, suffix[1:].upper(), uploaded_at, content, json.dumps(extracted)))
    return {"id": doc_id, "filename": safe_name, "file_type": suffix[1:].upper(),
            "uploaded_at": uploaded_at, "extracted": extracted,
            "preview": content[:500]}

@app.get("/api/documents")
def list_documents(q: Optional[str] = None):
    with connect() as con:
        rows = con.execute("SELECT id, filename, file_type, uploaded_at, content, extracted FROM documents ORDER BY uploaded_at DESC").fetchall()
    items = []
    for row in rows:
        if q and q.lower() not in (row["filename"] + " " + row["content"]).lower():
            continue
        items.append({"id": row["id"], "filename": row["filename"], "file_type": row["file_type"],
                      "uploaded_at": row["uploaded_at"], "extracted": json.loads(row["extracted"]),
                      "preview": row["content"][:240]})
    return {"documents": items, "count": len(items)}

@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str):
    with connect() as con:
        row = con.execute("SELECT * FROM documents WHERE id=?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"id": row["id"], "filename": row["filename"], "file_type": row["file_type"],
            "uploaded_at": row["uploaded_at"], "content": row["content"],
            "extracted": json.loads(row["extracted"])}

class CompareRequest(BaseModel):
    document_ids: list[str]

@app.post("/api/compare")
def compare_documents(payload: CompareRequest):
    if len(payload.document_ids) < 2:
        raise HTTPException(status_code=400, detail="Select at least two reports to compare")
    if len(payload.document_ids) > 8:
        raise HTTPException(status_code=400, detail="Compare up to 8 reports at once")
    marks = ",".join("?" for _ in payload.document_ids)
    with connect() as con:
        rows = con.execute(f"SELECT id, filename, uploaded_at, extracted FROM documents WHERE id IN ({marks})",
                           payload.document_ids).fetchall()
    by_id = {r["id"]: r for r in rows}
    results = []
    for did in payload.document_ids:
        row = by_id.get(did)
        if row:
            results.append({"id": row["id"], "filename": row["filename"], "uploaded_at": row["uploaded_at"],
                            "extracted": json.loads(row["extracted"])})
    return {"reports": results, "comparison_count": len(results)}

@app.post("/api/report")
def generate_report(payload: CompareRequest):
    if not payload.document_ids:
        raise HTTPException(status_code=400, detail="Select at least one report")
    marks = ",".join("?" for _ in payload.document_ids)
    with connect() as con:
        rows = con.execute(f"SELECT id, filename, file_type, uploaded_at, content, extracted FROM documents WHERE id IN ({marks})",
                           payload.document_ids).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No selected documents found")
    lines = ["MINING DOCUMENT INTELLIGENCE — GENERATED REPORT",
             f"Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z", "=" * 55, ""]
    for r in rows:
        e = json.loads(r["extracted"])
        lines += [f"Document: {r['filename']}", f"Type: {r['file_type']}",
                  f"Uploaded: {r['uploaded_at']}", f"Words: {e.get('word_count', 0)}",
                  f"Minerals detected: {', '.join(e.get('minerals', [])) or 'None detected'}",
                  f"Dates detected: {', '.join(e.get('dates', [])) or 'None detected'}",
                  f"Quantities detected: {', '.join(e.get('quantities', [])) or 'None detected'}",
                  f"Keywords: {', '.join(e.get('keywords', [])) or 'None detected'}",
                  "", "Content summary:", (r["content"][:1200].strip() or "No text could be extracted."),
                  "", "-" * 55, ""]
    return {"filename": "mining-analysis-report.txt", "report": "\n".join(lines)}
