"""Tamper-evident audit log helpers.

Phase 1 (now): SHA-256 hash chaining only — each entry's hash covers the
previous entry's hash plus this entry's fields, so any retroactive edit
breaks the chain.

Phase 2 (security week): add ECDSA (P-256) signing of entry_hash using
the acting user's private key, so entries are also attributable, not
just tamper-evident. That wiring lands when we build the security
pillar — this module is the extension point for it.
"""
import hashlib
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import select

from app import models

GENESIS_HASH = "0" * 64


def _canonical_fields(actor_id, patient_id, action, resource_id, occurred_at) -> str:
    return f"{actor_id}|{patient_id}|{action}|{resource_id}|{occurred_at.isoformat()}"


def record_audit_event(
    db: Session,
    actor_id: uuid.UUID,
    patient_id: uuid.UUID,
    action: str,
    resource_id: uuid.UUID | None = None,
) -> models.AuditLog:
    """Append a hash-chained audit entry. Call this from any route that
    reads or modifies a patient's data (view timeline, view document,
    add note, grant/revoke access).
    """
    last = db.execute(
        select(models.AuditLog).order_by(models.AuditLog.occurred_at.desc()).limit(1)
    ).scalar_one_or_none()
    prev_hash = last.entry_hash if last else GENESIS_HASH

    from datetime import datetime
    occurred_at = datetime.utcnow()
    canonical = _canonical_fields(actor_id, patient_id, action, resource_id, occurred_at)
    entry_hash = hashlib.sha256((prev_hash + canonical).encode()).hexdigest()

    entry = models.AuditLog(
        actor_id=actor_id,
        patient_id=patient_id,
        action=action,
        resource_id=resource_id,
        occurred_at=occurred_at,
        prev_hash=prev_hash,
        entry_hash=entry_hash,
        signature="unsigned",  # placeholder until ECDSA signing lands
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def verify_chain(db: Session, patient_id: uuid.UUID) -> bool:
    """Walk a patient's audit entries in order and confirm each entry_hash
    matches SHA256(prev_hash + canonical fields). Returns False the moment
    a break is found.
    """
    entries = db.execute(
        select(models.AuditLog)
        .where(models.AuditLog.patient_id == patient_id)
        .order_by(models.AuditLog.occurred_at.asc())
    ).scalars().all()

    prev_hash = GENESIS_HASH
    for e in entries:
        canonical = _canonical_fields(e.actor_id, e.patient_id, e.action, e.resource_id, e.occurred_at)
        expected = hashlib.sha256((prev_hash + canonical).encode()).hexdigest()
        if expected != e.entry_hash or e.prev_hash != prev_hash:
            return False
        prev_hash = e.entry_hash
    return True