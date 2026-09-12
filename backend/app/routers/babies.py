import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app import models, schemas, auth
from app.services import growth_reference, vaccination_schedule

router = APIRouter(prefix="/patients/me/babies", tags=["babies"])
require_patient = auth.require_role("patient")


def _age_months(birth: date, recorded: date) -> float:
    days = (recorded - birth).days
    return round(days / 30.4375, 1)  # average month length, good enough for chart placement


def _annotate(entry: models.BabyGrowthEntry, baby: models.BabyProfile) -> dict:
    age_months = _age_months(baby.date_of_birth, entry.recorded_at)

    weight_pct = weight_label = height_pct = height_label = None
    if entry.weight_kg is not None and baby.sex:
        weight_pct = growth_reference.estimate_percentile(
            "weight", float(entry.weight_kg), age_months, baby.sex
        )
        if weight_pct is not None:
            weight_label = growth_reference.percentile_band_label(weight_pct)

    if entry.height_cm is not None and baby.sex:
        height_pct = growth_reference.estimate_percentile(
            "length", float(entry.height_cm), age_months, baby.sex
        )
        if height_pct is not None:
            height_label = growth_reference.percentile_band_label(height_pct)

    return {
        "id": entry.id,
        "recorded_at": entry.recorded_at,
        "weight_kg": entry.weight_kg,
        "height_cm": entry.height_cm,
        "head_circ_cm": entry.head_circ_cm,
        "notes": entry.notes,
        "age_months": age_months,
        "weight_percentile": weight_pct,
        "weight_percentile_label": weight_label,
        "height_percentile": height_pct,
        "height_percentile_label": height_label,
    }


def _get_owned_baby(db: Session, baby_id: uuid.UUID, user: models.User) -> models.BabyProfile:
    baby = db.get(models.BabyProfile, baby_id)
    if not baby or baby.parent_user_id != user.id:
        raise HTTPException(status_code=404, detail="Baby profile not found")
    return baby


@router.post("", response_model=schemas.BabyProfileOut, status_code=201)
def create_baby(
    payload: schemas.BabyProfileCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    baby = models.BabyProfile(
        parent_user_id=user.id,
        name=payload.name,
        date_of_birth=payload.date_of_birth,
        sex=payload.sex,
    )
    db.add(baby)
    db.commit()
    db.refresh(baby)
    return baby


@router.get("", response_model=list[schemas.BabyProfileOut])
def list_babies(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    return db.execute(
        select(models.BabyProfile)
        .where(models.BabyProfile.parent_user_id == user.id)
        .order_by(models.BabyProfile.created_at.desc())
    ).scalars().all()


@router.post("/{baby_id}/growth", status_code=201)
def add_growth_entry(
    baby_id: uuid.UUID,
    payload: schemas.GrowthEntryCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    baby = _get_owned_baby(db, baby_id, user)

    if payload.recorded_at < baby.date_of_birth:
        raise HTTPException(status_code=422, detail="Measurement date can't be before the baby's date of birth")

    entry = models.BabyGrowthEntry(
        baby_id=baby.id,
        recorded_at=payload.recorded_at,
        weight_kg=payload.weight_kg,
        height_cm=payload.height_cm,
        head_circ_cm=payload.head_circ_cm,
        notes=payload.notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _annotate(entry, baby)


@router.get("/{baby_id}/growth")
def list_growth_entries(
    baby_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    baby = _get_owned_baby(db, baby_id, user)
    entries = db.execute(
        select(models.BabyGrowthEntry)
        .where(models.BabyGrowthEntry.baby_id == baby.id)
        .order_by(models.BabyGrowthEntry.recorded_at.asc())
    ).scalars().all()
    return [_annotate(e, baby) for e in entries]


@router.delete("/{baby_id}/growth/{entry_id}", status_code=204)
def delete_growth_entry(
    baby_id: uuid.UUID,
    entry_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    baby = _get_owned_baby(db, baby_id, user)
    entry = db.get(models.BabyGrowthEntry, entry_id)
    if not entry or entry.baby_id != baby.id:
        raise HTTPException(status_code=404, detail="Growth entry not found")
    db.delete(entry)
    db.commit()

def _milestone_status(due_date: date, completed_at: date | None, today: date) -> str:
    if completed_at is not None:
        return "completed"
    if due_date < today:
        return "overdue"
    if due_date <= today + timedelta(days=14):
        return "due_soon"
    return "upcoming"


@router.get("/{baby_id}/milestones", response_model=list[schemas.MilestoneOut])
def list_milestones(
    baby_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    baby = _get_owned_baby(db, baby_id, user)
    today = date.today()

    completions = db.execute(
        select(models.BabyMilestoneCompletion)
        .where(models.BabyMilestoneCompletion.baby_id == baby.id)
    ).scalars().all()
    completed_by_key = {c.milestone_key: c for c in completions}

    results = []
    for item in vaccination_schedule.get_schedule():
        due_date = baby.date_of_birth + timedelta(days=item["age_days"])
        completion = completed_by_key.get(item["key"])
        results.append(schemas.MilestoneOut(
            key=item["key"],
            name=item["name"],
            kind=item["kind"],
            age_label=item["age_label"],
            due_date=due_date,
            status=_milestone_status(due_date, completion.completed_at if completion else None, today),
            completed_at=completion.completed_at if completion else None,
            notes=completion.notes if completion else None,
        ))
    return results


@router.post("/{baby_id}/milestones/{milestone_key}/complete", response_model=schemas.MilestoneOut)
def complete_milestone(
    baby_id: uuid.UUID,
    milestone_key: str,
    payload: schemas.MilestoneCompleteRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    baby = _get_owned_baby(db, baby_id, user)

    schedule_item = next(
        (i for i in vaccination_schedule.get_schedule() if i["key"] == milestone_key), None
    )
    if not schedule_item:
        raise HTTPException(status_code=404, detail="Unknown milestone")

    existing = db.execute(
        select(models.BabyMilestoneCompletion).where(
            models.BabyMilestoneCompletion.baby_id == baby.id,
            models.BabyMilestoneCompletion.milestone_key == milestone_key,
        )
    ).scalar_one_or_none()

    if existing:
        existing.completed_at = payload.completed_at
        existing.notes = payload.notes
    else:
        existing = models.BabyMilestoneCompletion(
            baby_id=baby.id,
            milestone_key=milestone_key,
            completed_at=payload.completed_at,
            notes=payload.notes,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)

    due_date = baby.date_of_birth + timedelta(days=schedule_item["age_days"])
    return schemas.MilestoneOut(
        key=schedule_item["key"],
        name=schedule_item["name"],
        kind=schedule_item["kind"],
        age_label=schedule_item["age_label"],
        due_date=due_date,
        status="completed",
        completed_at=existing.completed_at,
        notes=existing.notes,
    )


@router.delete("/{baby_id}/milestones/{milestone_key}/complete", status_code=204)
def uncomplete_milestone(
    baby_id: uuid.UUID,
    milestone_key: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    baby = _get_owned_baby(db, baby_id, user)
    existing = db.execute(
        select(models.BabyMilestoneCompletion).where(
            models.BabyMilestoneCompletion.baby_id == baby.id,
            models.BabyMilestoneCompletion.milestone_key == milestone_key,
        )
    ).scalar_one_or_none()
    if existing:
        db.delete(existing)
        db.commit()
