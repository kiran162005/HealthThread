import uuid
import mimetypes
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.database import get_db
from app import models, schemas, auth, security
from app.services import crypto

router = APIRouter(prefix="/doctors", tags=["doctors"])
require_doctor = auth.require_role("doctor")


def _assert_active_permission(db: Session, doctor_id: uuid.UUID, patient_id: uuid.UUID) -> None:
    perm = db.execute(
        select(models.Permission).where(
            models.Permission.doctor_id == doctor_id,
            models.Permission.patient_id == patient_id,
            models.Permission.status == models.PermissionStatus.active,
        )
    ).scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=403, detail="No active access to this patient")


@router.get("/me/patients", response_model=list[schemas.DoctorPatientSummaryOut])
def list_my_patients(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_doctor),
):
    """Patient list with at-a-glance stats: how many documents this
    doctor has been shared, when something last happened, and how many
    shared documents are new since the doctor's last visit to that
    patient's timeline (derived from the audit log's view_timeline
    events — no separate "read" tracking table needed).
    """
    perms = db.execute(
        select(models.Permission, models.User)
        .join(models.User, models.User.id == models.Permission.patient_id)
        .where(
            models.Permission.doctor_id == user.id,
            models.Permission.status == models.PermissionStatus.active,
        )
    ).all()

    summaries = []
    for perm, patient in perms:
        shared_docs = db.execute(
            select(models.DocumentShare).where(
                models.DocumentShare.doctor_id == user.id,
                models.DocumentShare.patient_id == patient.id,
            )
        ).scalars().all()

        last_note_at = db.execute(
            select(func.max(models.DoctorNote.created_at)).where(
                models.DoctorNote.doctor_id == user.id,
                models.DoctorNote.patient_id == patient.id,
            )
        ).scalar_one()

        last_viewed_at = db.execute(
            select(func.max(models.AuditLog.occurred_at)).where(
                models.AuditLog.actor_id == user.id,
                models.AuditLog.patient_id == patient.id,
                models.AuditLog.action == "view_timeline",
            )
        ).scalar_one()

        activity_dates = [d.shared_at for d in shared_docs]
        if last_note_at:
            activity_dates.append(last_note_at)
        last_activity_at = max(activity_dates) if activity_dates else perm.granted_at

        if last_viewed_at:
            new_items_count = sum(1 for d in shared_docs if d.shared_at > last_viewed_at)
        else:
            new_items_count = len(shared_docs)

        summaries.append(schemas.DoctorPatientSummaryOut(
            id=patient.id,
            email=patient.email,
            full_name=patient.full_name,
            role=patient.role,
            is_verified=patient.is_verified,
            shared_document_count=len(shared_docs),
            last_activity_at=last_activity_at,
            new_items_count=new_items_count,
        ))

    summaries.sort(key=lambda s: s.last_activity_at, reverse=True)
    return summaries


@router.get("/me/patients/{patient_id}/timeline", response_model=list[schemas.TimelineEntryOut])
def view_patient_timeline(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_doctor),
):
    """A doctor only sees: documents explicitly shared with them, and
    notes (part of the shared care record). Symptom checks and skin
    checks stay private by default — not shared just because a doctor
    is connected.
    """
    _assert_active_permission(db, user.id, patient_id)

    all_entries = db.execute(
        select(models.TimelineEntry)
        .where(models.TimelineEntry.patient_id == patient_id)
        .order_by(models.TimelineEntry.occurred_at.desc())
    ).scalars().all()

    shared_doc_ids = {
        row[0] for row in db.execute(
            select(models.DocumentShare.document_id).where(
                models.DocumentShare.patient_id == patient_id,
                models.DocumentShare.doctor_id == user.id,
            )
        ).all()
    }

    visible = [
        e for e in all_entries
        if (e.entry_type == "document" and e.ref_id in shared_doc_ids)
        or e.entry_type == "doctor_note"
    ]

    security.record_audit_event(db, user.id, patient_id, "view_timeline")

    return visible


@router.get("/me/patients/{patient_id}/documents/{document_id}/file")
def view_patient_document_file(
    patient_id: uuid.UUID,
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_doctor),
):
    """Doctors see the actual raw document — not the patient-facing plain-
    language explanation. Decrypted on the fly from the stored ciphertext;
    nothing is ever kept decrypted on disk.
    """
    _assert_active_permission(db, user.id, patient_id)

    shared = db.execute(
        select(models.DocumentShare).where(
            models.DocumentShare.document_id == document_id,
            models.DocumentShare.doctor_id == user.id,
        )
    ).scalar_one_or_none()
    if not shared:
        raise HTTPException(status_code=403, detail="This document hasn't been shared with you")

    doc = db.get(models.Document, document_id)
    if not doc or doc.patient_id != patient_id:
        raise HTTPException(status_code=404, detail="Document not found")

    ciphertext = Path(doc.file_url).read_bytes()
    plaintext = crypto.decrypt_bytes(ciphertext, doc.iv, doc.auth_tag)

    media_type, _ = mimetypes.guess_type(doc.original_filename or "")
    media_type = media_type or "application/octet-stream"

    security.record_audit_event(db, user.id, patient_id, "view_document_file", document_id)

    return Response(
        content=plaintext,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{doc.original_filename or "document"}"'},
    )


@router.get("/me/patients/{patient_id}/notes", response_model=list[schemas.DoctorNoteOut])
def list_patient_notes(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_doctor),
):
    _assert_active_permission(db, user.id, patient_id)

    notes = db.execute(
        select(models.DoctorNote)
        .where(models.DoctorNote.patient_id == patient_id)
        .order_by(models.DoctorNote.created_at.desc())
    ).scalars().all()
    return notes


@router.post("/me/patients/{patient_id}/notes", response_model=schemas.DoctorNoteOut, status_code=201)
def add_note(
    patient_id: uuid.UUID,
    payload: schemas.DoctorNoteCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_doctor),
):
    _assert_active_permission(db, user.id, patient_id)

    note = models.DoctorNote(patient_id=patient_id, doctor_id=user.id, note=payload.note)
    db.add(note)
    db.commit()
    db.refresh(note)

    entry = models.TimelineEntry(
        patient_id=patient_id,
        entry_type="doctor_note",
        ref_id=note.id,
        summary=f"Note added by Dr. {user.full_name}",
    )
    db.add(entry)
    security.record_audit_event(db, user.id, patient_id, "add_note", note.id)
    db.commit()

    return note