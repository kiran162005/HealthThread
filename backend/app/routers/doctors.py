import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app import models, schemas, auth, security

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


@router.get("/me/patients", response_model=list[schemas.UserOut])
def list_my_patients(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_doctor),
):
    rows = db.execute(
        select(models.User)
        .join(models.Permission, models.Permission.patient_id == models.User.id)
        .where(
            models.Permission.doctor_id == user.id,
            models.Permission.status == models.PermissionStatus.active,
        )
    ).scalars().all()
    return rows


@router.get("/me/patients/{patient_id}/timeline", response_model=list[schemas.TimelineEntryOut])
def view_patient_timeline(
    patient_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_doctor),
):
    _assert_active_permission(db, user.id, patient_id)

    entries = db.execute(
        select(models.TimelineEntry)
        .where(models.TimelineEntry.patient_id == patient_id)
        .order_by(models.TimelineEntry.occurred_at.desc())
    ).scalars().all()

    # Every doctor view of a patient's record is itself an audited event
    security.record_audit_event(db, user.id, patient_id, "view_timeline")

    return entries


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