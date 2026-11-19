# HealthThread

A full-stack health records platform that helps a patient organize their medical history, understand their documents in plain language, reason about symptoms against their own history, and share records securely with a doctor.

> **Disclaimer:** HealthThread is a portfolio project. It explains and flags; it never diagnoses and is not a substitute for professional medical advice.

---

## Why HealthThread

Most symptom checkers treat every query in isolation. HealthThread keeps a longitudinal record per patient and grounds its reasoning in that person's own history: past reports, earlier symptoms, and prior conversations.

## Features

### Patient side
- **Document upload and explanation**: Upload a lab report or prescription. Text is extracted with OCR (Docling), checked to confirm it is a medical document, then explained in plain language by an LLM (Groq). Ask follow-up questions on each document.
- **Quick-explain vs. permanent records**: A `saved_to_records` flag separates one-off explanations from documents saved to Medical Records.
- **Duplicate detection**: SHA-256 hashing prevents the same document being stored twice.
- **Symptom reasoning agent**: A LangGraph flow (Triage → History Retrieval → Reasoning) retrieves relevant past records via pgvector embeddings. Follow-up questions are capped at 3 rounds and can be skipped by the user.
- **Skin Check**: A ResNet18 classifier fine-tuned on HAM10000 returns a "worth checking" flag, not a diagnosis.
- **Timeline**: A chronological view of the patient's records and events.
- **Baby growth tracking**: Charts against WHO-style percentile curves (recharts).
- **Vaccination and checkup reminders**: An India UIP schedule with due-date and status logic, and mark-complete endpoints.
- **Share access**: Grant a doctor access to specific documents.
- **Security log**: View the audit trail of access to your data.

### Doctor side
- Patient search
- Per-document sharing (via a `document_shares` table), so doctors only see what a patient chose to share
- Last-activity timestamps, shared document counts, and a "new items" badge

### Security
- **AES-256-GCM** encryption of stored documents
- **Hash-chained audit log**: each entry includes the hash of the previous entry (scoped per patient), so tampering is detectable
- **ECDSA (P-256)** signatures on audit entries
- **JWT** authentication with bcrypt-hashed passwords

## What is real vs. simulated

| Component | Status |
|---|---|
| Document explanation and Q&A | Real LLM integration (Groq) |
| Symptom reasoning agent | Real LangGraph agent with pgvector retrieval |
| Skin classifier | Real model, fine-tuned on HAM10000 |
| Encryption, signing, audit chain | Real cryptography |
| Doctor accounts | Simulated for the portfolio version (no real clinician verification) |

## Tech stack

| Layer | Technologies |
|---|---|
| Frontend | React (Vite), Tailwind CSS, react-router-dom, axios, recharts, lucide-react |
| Backend | FastAPI, SQLAlchemy, psycopg v3 |
| Database | PostgreSQL (Neon), pgvector |
| LLM / agents | Groq, LangGraph |
| Embeddings | sentence-transformers (`all-MiniLM-L6-v2`, local) |
| OCR | Docling |
| ML | PyTorch (CPU), ResNet18 |

## Project structure

```
HealthThread/
├── backend/     # FastAPI app, models, routes, agents, ML inference
├── frontend/    # React (Vite) app
└── README.md
```

## Getting started

### Prerequisites
- Python 3.10+
- Node.js 18+
- A PostgreSQL database with the `pgvector` extension (Neon free tier works)
- A Groq API key

### Backend

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in `backend/`:

```env
DATABASE_URL=postgresql+psycopg://user:password@host/dbname
GROQ_API_KEY=your_groq_key
JWT_SECRET=a_long_random_string
# Keys for document encryption and audit signing, as required by your config
```

Run the server:

```bash
uvicorn main:app --reload
```

Interactive API docs are at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## Roadmap

- UI redesign pass
- Trained time-series model for health trend prediction
- Real clinician verification for doctor accounts

## Author

**Kiran**, Computer Science Engineering student, aspiring AI Engineer.
GitHub: [@kiran162005](https://github.com/kiran162005)
