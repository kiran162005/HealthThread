import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app import models, schemas, auth, security

router = APIRouter(prefix="/patients", tags=["patients"])
require_patient = auth.require_role("patient")


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
def upload_document(
    payload: schemas.DocumentUpload,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    """Stores only what the client already encrypted (file_url pointer +
    IV + auth tag). Plaintext extraction/explanation happens in a later
    pipeline step (OCR -> LLM), not here.
    """
    doc = models.Document(
        patient_id=user.id,
        doc_type=models.DocumentType(payload.doc_type),
        file_url=payload.file_url,
        iv=payload.iv,
        auth_tag=payload.auth_tag,
        original_filename=payload.original_filename,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    entry = models.TimelineEntry(
        patient_id=user.id,
        entry_type="document",
        ref_id=doc.id,
        summary=f"Uploaded {payload.doc_type}: {payload.original_filename or 'document'}",
    )
    db.add(entry)
    db.commit()

    return doc


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