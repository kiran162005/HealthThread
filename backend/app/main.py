from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth, patients, doctors, symptom

# In early development this creates tables directly from the models.
# Once the schema stabilizes, switch to Alembic migrations (schema.sql
# is the authoritative reference either way).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Personal Health Intelligence Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(doctors.router)
app.include_router(symptom.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}