# SIH26023 – Mining Document Intelligence System

A starter full-stack prototype for uploading mining documents, extracting key information, searching reports, comparing historical records, and generating summaries/reports.

## Features
- React + Vite dashboard
- Upload PDF, DOCX, TXT, and CSV files
- Python FastAPI backend
- Text extraction for TXT/CSV, PDF, and DOCX
- Lightweight NLP extraction of dates, locations, minerals, quantities, and keywords
- Search uploaded reports
- Compare selected report records / extracted metrics
- Generate a downloadable text report
- SQLite database for metadata and extracted content

> This is a hackathon prototype. Extraction is heuristic-based and must be verified by a domain expert. It is not a certified mining, safety, or regulatory decision system.

## Requirements
- Node.js 18+
- Python 3.10+

## Run the backend
From this folder:

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend API: http://127.0.0.1:8000  
API docs: http://127.0.0.1:8000/docs

## Run the frontend
Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

## Notes
- Uploaded files are stored in `backend/uploads/`; SQLite database is `backend/mining_docs.db`.
- For production, add authentication, file-size limits, antivirus scanning, role-based access, backups, audit logs, and secure object storage.
- Do not upload confidential or sensitive documents to a public deployment without appropriate authorization and security controls.
