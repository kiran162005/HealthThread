"""Tamper-evident, attributable audit log helpers.

Phase 1: SHA-256 hash chaining — each entry's hash covers the previous
entry's hash plus this entry's fields, so any retroactive edit breaks
the chain from that point forward.

Phase 2 (this module, now): ECDSA (P-256) signing of entry_hash using
the acting user's private key, so entries are also attributable — a
verifier can confirm *this specific user's key* produced this entry,
not just that the chain is unbroken.

Honest limitation: signing happens server-side at write time (the
private key is generated and stored server-side, not on the user's
own device), because audit events are recorded by the backend, not
submitted pre-signed by a client. That means this proves the log
wasn't secretly rewritten after the fact, but it does not prove the
server itself never colluded with a bad actor at write time. A real
deployment would move key custody and signing to the client (e.g. a
browser-held key via WebCrypto) so the server never sees a private
key at all.
"""
import base64
import hashlib
import uuid
from datetime import datetime, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy.orm import Session
from sqlalchemy import select

from app import models

GENESIS_HASH = "0" * 64


def _canonical_fields(actor_id, patient_id, action, resource_id, occurred_at) -> str:
    return f"{actor_id}|{patient_id}|{action}|{resource_id}|{occurred_at.isoformat()}"


def get_or_create_keypair(db: Session, user_id: uuid.UUID) -> tuple[str, str]:
    """Returns (private_key_pem, public_key_pem) for this user, generating
    and persisting a fresh P-256 keypair the first time they trigger an
    audit event. Existing accounts get a key on first use — no backfill
    migration needed.
    """
    user = db.get(models.User, user_id)
    if user.ec_private_key_pem and user.ec_public_key_pem:
        return user.ec_private_key_pem, user.ec_public_key_pem

    private_key = ec.generate_private_key(ec.SECP256R1())
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

    user.ec_private_key_pem = private_pem
    user.ec_public_key_pem = public_pem
    db.add(user)
    db.commit()
    return private_pem, public_pem


def sign_hash(private_key_pem: str, entry_hash: str) -> str:
    """Signs entry_hash with the given PEM-encoded P-256 private key,
    returning a base64-encoded DER signature.
    """
    private_key = serialization.load_pem_private_key(private_key_pem.encode(), password=None)
    signature = private_key.sign(entry_hash.encode(), ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(signature).decode()


def verify_signature(public_key_pem: str, entry_hash: str, signature_b64: str) -> bool:
    """Verifies a base64-encoded DER signature over entry_hash against
    the given PEM-encoded public key. Returns False on any malformed
    input rather than raising, so a corrupted entry just fails
    verification instead of crashing the verifier.
    """
    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode())
        signature = base64.b64decode(signature_b64)
        public_key.verify(signature, entry_hash.encode(), ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def record_audit_event(
    db: Session,
    actor_id: uuid.UUID,
    patient_id: uuid.UUID,
    action: str,
    resource_id: uuid.UUID | None = None,
) -> models.AuditLog:
    """Append a hash-chained, ECDSA-signed audit entry. Call this from
    any route that reads or modifies a patient's data (view timeline,
    view document, add note, grant/revoke access).
    """
    last = db.execute(
        select(models.AuditLog)
        .where(models.AuditLog.patient_id == patient_id)
        .order_by(models.AuditLog.occurred_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    prev_hash = last.entry_hash if last else GENESIS_HASH

    occurred_at = datetime.now(timezone.utc)
    canonical = _canonical_fields(actor_id, patient_id, action, resource_id, occurred_at)
    entry_hash = hashlib.sha256((prev_hash + canonical).encode()).hexdigest()

    private_pem, _ = get_or_create_keypair(db, actor_id)
    signature = sign_hash(private_pem, entry_hash)

    entry = models.AuditLog(
        actor_id=actor_id,
        patient_id=patient_id,
        action=action,
        resource_id=resource_id,
        occurred_at=occurred_at,
        prev_hash=prev_hash,
        entry_hash=entry_hash,
        signature=signature,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def verify_chain(db: Session, patient_id: uuid.UUID) -> dict:
    """Walk a patient's audit entries in order, confirming both:
      1. each entry_hash matches SHA256(prev_hash + canonical fields)
      2. each entry's signature verifies against its actor's public key

    Returns a diagnostic dict rather than a bare bool, since a verifier
    tool needs to say *where* a chain broke, not just that it did:
      {
        "valid": bool,               # overall pass/fail
        "entries_checked": int,
        "broken_at_index": int | None,   # 0-indexed position of first failure
        "broken_reason": str | None,     # "hash_mismatch" | "bad_signature"
      }
    """
    entries = db.execute(
        select(models.AuditLog)
        .where(models.AuditLog.patient_id == patient_id)
        .order_by(models.AuditLog.occurred_at.asc())
    ).scalars().all()

    public_key_cache: dict[uuid.UUID, str | None] = {}

    prev_hash = GENESIS_HASH
    for i, e in enumerate(entries):
        canonical = _canonical_fields(e.actor_id, e.patient_id, e.action, e.resource_id, e.occurred_at)
        expected_hash = hashlib.sha256((prev_hash + canonical).encode()).hexdigest()

        if expected_hash != e.entry_hash or e.prev_hash != prev_hash:
            return {
                "valid": False,
                "entries_checked": i + 1,
                "broken_at_index": i,
                "broken_reason": "hash_mismatch",
            }

        if e.actor_id not in public_key_cache:
            actor = db.get(models.User, e.actor_id)
            public_key_cache[e.actor_id] = actor.ec_public_key_pem if actor else None

        public_pem = public_key_cache[e.actor_id]
        if not public_pem or not verify_signature(public_pem, e.entry_hash, e.signature):
            return {
                "valid": False,
                "entries_checked": i + 1,
                "broken_at_index": i,
                "broken_reason": "bad_signature",
            }

        prev_hash = e.entry_hash

    return {
        "valid": True,
        "entries_checked": len(entries),
        "broken_at_index": None,
        "broken_reason": None,
    }