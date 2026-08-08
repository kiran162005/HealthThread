import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app import models, schemas, auth, security
from app.services import crypto, extraction, explain

router = APIRouter(prefix="/patients", tags=["patients"])
require_patient = auth.require_role("patient")

STORAGE_DIR = Path(os.getenv("DOCUMENT_STORAGE_DIR", "storage/documents"))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/me/timeline", response_model=list[schemas.TimelineEntryOut])
def get_my_timeline(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    entries = db.execute(
        select(models.TimelineEntry)
        .where(models.TimelineEntry.patient_id == user.id)
        .order_by(models.TimelineEntry.occurred_at.desc())
    ).scalars().all()
    return entries


@router.post("/me/documents", response_model=schemas.DocumentOut, status_code=201)
async def upload_document(
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    """Accepts the raw file directly (multipart), rather than a
    pre-encrypted blob — see app/services/crypto.py for why: the server
    needs plaintext briefly to run extraction, then encrypts before
    anything is written to disk.
    """
    raw_bytes = await file.read()

    # 1. Extract text (Docling — handles PDF and scanned images alike)
    try:
        raw_text = extraction.extract_text(raw_bytes, file.filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read document: {e}")

    # 2. Plain-language explanation (Groq)
    if not raw_text.strip():
        plain_explanation = None
    elif not explain.is_medical_document(raw_text):
        plain_explanation = (
            "This document doesn't look like a medical report or prescription, "
            "so no explanation was generated. If this seems wrong, try re-uploading "
            "a clearer copy."
        )
    else:
        plain_explanation = explain.explain_document(raw_text)

    # 3. Encrypt and persist to disk — plaintext bytes are discarded after this
    ciphertext, iv_b64, tag_b64 = crypto.encrypt_bytes(raw_bytes)
    doc_id = uuid.uuid4()
    file_path = STORAGE_DIR / f"{doc_id}.enc"
    file_path.write_bytes(ciphertext)

    # 4. Store metadata + extraction result
    doc = models.Document(
        id=doc_id,
        patient_id=user.id,
        doc_type=models.DocumentType(doc_type),
        file_url=str(file_path),
        iv=iv_b64,
        auth_tag=tag_b64,
        original_filename=file.filename,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    extraction_row = models.DocumentExtraction(
        document_id=doc.id,
        raw_text=raw_text,
        plain_explanation=plain_explanation,
    )
    db.add(extraction_row)

    entry = models.TimelineEntry(
        patient_id=user.id,
        entry_type="document",
        ref_id=doc.id,
        summary=f"Uploaded {doc_type}: {file.filename}",
    )
    db.add(entry)
    db.commit()

    return doc


@router.get("/me/documents/{document_id}/explanation")
def get_document_explanation(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    doc = db.get(models.Document, document_id)
    if not doc or doc.patient_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")

    row = db.execute(
        select(models.DocumentExtraction).where(models.DocumentExtraction.document_id == document_id)
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="No extraction available for this document")

    return {
        "plain_explanation": row.plain_explanation,
        "raw_text": row.raw_text,
    }


@router.post("/me/share", response_model=schemas.PermissionOut, status_code=201)
def grant_access(
    payload: schemas.GrantAccessRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    doctor = db.execute(
        select(models.User).where(
            models.User.email == payload.doctor_email,
            models.User.role == models.UserRole.doctor,
        )
    ).scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    existing = db.execute(
        select(models.Permission).where(
            models.Permission.patient_id == user.id,
            models.Permission.doctor_id == doctor.id,
        )
    ).scalar_one_or_none()

    if existing:
        existing.status = models.PermissionStatus.active
        existing.revoked_at = None
        db.commit()
        db.refresh(existing)
        security.record_audit_event(db, user.id, user.id, "grant_access", doctor.id)
        return existing

    perm = models.Permission(patient_id=user.id, doctor_id=doctor.id)
    db.add(perm)
    db.commit()
    db.refresh(perm)
    security.record_audit_event(db, user.id, user.id, "grant_access", doctor.id)
    return perm

@router.delete("/me/documents/{document_id}", status_code=204)
def delete_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    doc = db.get(models.Document, document_id)
    if not doc or doc.patient_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove the encrypted file from disk first — if this fails, we haven't
    # touched the DB yet, so nothing is left inconsistent.
    file_path = Path(doc.file_url)
    if file_path.exists():
        file_path.unlink()

    db.execute(
        models.DocumentExtraction.__table__.delete().where(
            models.DocumentExtraction.document_id == document_id
        )
    )
    db.execute(
        models.TimelineEntry.__table__.delete().where(
            models.TimelineEntry.ref_id == document_id
        )
    )
    db.delete(doc)
    security.record_audit_event(db, user.id, user.id, "delete_document", document_id)
    db.commit()

@router.delete("/me/share/{doctor_id}", status_code=204)
def revoke_access(
    doctor_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    perm = db.execute(
        select(models.Permission).where(
            models.Permission.patient_id == user.id,
            models.Permission.doctor_id == doctor_id,
        )
    ).scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")

    perm.status = models.PermissionStatus.revoked
    from datetime import datetime
    perm.revoked_at = datetime.utcnow()
    db.commit()
    security.record_audit_event(db, user.id, user.id, "revoke_access", doctor_id)


@router.get("/me/audit-log")
def get_my_audit_log(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    """Patient-visible 'who accessed your data, and when' view."""
    entries = db.execute(
        select(models.AuditLog)
        .where(models.AuditLog.patient_id == user.id)
        .order_by(models.AuditLog.occurred_at.desc())
    ).scalars().all()
    return [
        {
            "actor_id": e.actor_id,
            "action": e.action,
            "occurred_at": e.occurred_at,
            "resource_id": e.resource_id,
        }
        for e in entries
    ]