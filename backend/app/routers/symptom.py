import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app import models, auth
from app.services import symptom_agent

router = APIRouter(prefix="/patients", tags=["symptom-checker"])
require_patient = auth.require_role("patient")


class SymptomCheckRequest(BaseModel):
    session_id: uuid.UUID | None = None
    message: str
    force_ready: bool = False  # user chose "answer now" instead of another follow-up


@router.post("/me/symptom-check")
def symptom_check(
    payload: SymptomCheckRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    if payload.session_id:
        session = db.get(models.SymptomSession, payload.session_id)
        if not session or session.patient_id != user.id:
            raise HTTPException(status_code=404, detail="Session not found")
        transcript = list(session.transcript)
    else:
        session = models.SymptomSession(patient_id=user.id, transcript=[])
        db.add(session)
        transcript = []

    transcript.append({"role": "patient", "message": payload.message})

    result = symptom_agent.run_symptom_check(db, str(user.id), transcript, force_ready=payload.force_ready)

    if result["status"] == "need_more_info":
        transcript.append({"role": "agent", "message": result["follow_up_question"]})
        session.transcript = transcript
        db.commit()
        db.refresh(session)
        return {
            "session_id": session.id,
            "status": "need_more_info",
            "question": result["follow_up_question"],
        }

    # ready — final answer produced
    transcript.append({"role": "agent", "message": result["final_summary"]})
    session.transcript = transcript
    session.retrieved_context = {
        "chunks": [
            {"document_id": str(c["document_id"]), "similarity": c["similarity"]}
            for c in result["retrieved_chunks"]
        ]
    }
    session.summary = result["final_summary"]
    session.confidence = result["confidence"]
    db.commit()
    db.refresh(session)

    entry = models.TimelineEntry(
        patient_id=user.id,
        entry_type="symptom_check",
        ref_id=session.id,
        summary=f"Symptom check: {payload.message[:80]}",
    )
    db.add(entry)
    db.commit()

    return {
        "session_id": session.id,
        "status": "complete",
        "summary": result["final_summary"],
        "confidence": result["confidence"],
        "sources_used": len([c for c in result["retrieved_chunks"] if c["similarity"] > 0.25]),
    }


@router.delete("/me/symptom-check/{session_id}", status_code=204)
def delete_symptom_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    session = db.get(models.SymptomSession, session_id)
    if not session or session.patient_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    db.execute(
        models.TimelineEntry.__table__.delete().where(
            models.TimelineEntry.ref_id == session_id
        )
    )
    db.delete(session)
    db.commit()