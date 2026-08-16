import os
import uuid
import hashlib
import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from pydantic import BaseModel
from app import models, schemas, auth, security
from app.services import crypto, extraction, explain, embeddings, retrieval, skin_classifier

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
    save_to_records: bool = Form(False),
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    """Accepts the raw file directly (multipart), rather than a
    pre-encrypted blob — see app/services/crypto.py for why: the server
    needs plaintext briefly to run extraction, then encrypts before
    anything is written to disk.
    """
    raw_bytes = await file.read()

    # Duplicate check — before any expensive extraction/embedding work
    content_hash = hashlib.sha256(raw_bytes).hexdigest()
    existing = db.execute(
        select(models.Document).where(
            models.Document.patient_id == user.id,
            models.Document.content_hash == content_hash,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="You've already uploaded this exact document")

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
        content_hash=content_hash,
        saved_to_records=save_to_records,
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

    # 5. Chunk + embed for retrieval — this is what the RAG
    # symptom-reasoning agent will search over later.
    if raw_text.strip():
        chunks = embeddings.chunk_text(raw_text)
        if chunks:
            vectors = embeddings.embed_chunks(chunks)
            for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
                db.add(models.DocumentChunk(
                    document_id=doc.id,
                    patient_id=user.id,
                    chunk_index=i,
                    chunk_text=chunk,
                    embedding=vector,
                ))

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


@router.get("/me/documents/{document_id}/file")
def view_my_document_file(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    """The patient viewing their own document — the actual file, in its
    original format, not the AI explanation.
    """
    doc = db.get(models.Document, document_id)
    if not doc or doc.patient_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")

    ciphertext = Path(doc.file_url).read_bytes()
    plaintext = crypto.decrypt_bytes(ciphertext, doc.iv, doc.auth_tag)

    media_type, _ = mimetypes.guess_type(doc.original_filename or "")
    media_type = media_type or "application/octet-stream"

    return Response(
        content=plaintext,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{doc.original_filename or "document"}"'},
    )


@router.post("/me/documents/{document_id}/ask")
def ask_about_document(
    document_id: uuid.UUID,
    payload: schemas.AskQuestionRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    doc = db.get(models.Document, document_id)
    if not doc or doc.patient_id != user.id:
        raise HTTPException(status_code=404, detail="Document not found")

    row = db.execute(
        select(models.DocumentExtraction).where(models.DocumentExtraction.document_id == document_id)
    ).scalar_one_or_none()
    if not row or not row.raw_text:
        raise HTTPException(status_code=404, detail="No document text available to answer from")

    answer = explain.ask_about_document(row.raw_text, payload.question)
    return {"answer": answer}

@router.post("/me/skin-check")
async def skin_check(
    file: UploadFile = File(...),
    user: models.User = Depends(require_patient),
):
    """Standalone skin lesion classification — not stored as a Document.
    A photo isn't something Docling extraction applies to, and this is
    a quick experimental read rather than a record worth keeping in the
    patient's timeline. See app/services/skin_classifier.py for the
    model itself and its accuracy caveats.
    """
    raw_bytes = await file.read()
    try:
        result = skin_classifier.classify_image(raw_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return result

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
        models.DocumentChunk.__table__.delete().where(
            models.DocumentChunk.document_id == document_id
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


@router.get("/me/documents")
def list_my_documents(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    """Medical Records folder view — every uploaded document, independent
    of the chronological Timeline, plus who each one is currently shared
    with.
    """
    docs = db.execute(
        select(models.Document)
        .where(
            models.Document.patient_id == user.id,
            models.Document.saved_to_records == True,  # noqa: E712
        )
        .order_by(models.Document.uploaded_at.desc())
    ).scalars().all()

    shares_by_doc: dict = {}
    share_rows = db.execute(
        select(models.DocumentShare, models.User)
        .join(models.User, models.User.id == models.DocumentShare.doctor_id)
        .where(models.DocumentShare.patient_id == user.id)
    ).all()
    for share, doctor in share_rows:
        shares_by_doc.setdefault(share.document_id, []).append(
            {"doctor_id": doctor.id, "doctor_name": doctor.full_name}
        )

    return [
        {
            "id": doc.id,
            "doc_type": doc.doc_type.value,
            "original_filename": doc.original_filename,
            "uploaded_at": doc.uploaded_at,
            "shared_with": shares_by_doc.get(doc.id, []),
        }
        for doc in docs
    ]


class ShareRecordsRequest(BaseModel):
    doctor_id: uuid.UUID
    document_ids: list[uuid.UUID] | None = None  # None/empty = share all
    note: str | None = None


@router.post("/me/share-records", status_code=201)
def share_records(
    payload: ShareRecordsRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    # Must already be a connected doctor (an active Permission) before
    # documents can be shared with them.
    perm = db.execute(
        select(models.Permission).where(
            models.Permission.patient_id == user.id,
            models.Permission.doctor_id == payload.doctor_id,
            models.Permission.status == models.PermissionStatus.active,
        )
    ).scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=403, detail="Grant this doctor access before sharing records")

    if payload.document_ids:
        doc_ids = payload.document_ids
    else:
        doc_ids = [
            d.id for d in db.execute(
                select(models.Document.id).where(models.Document.patient_id == user.id)
            ).all()
        ]

    shared_count = 0
    for doc_id in doc_ids:
        existing = db.execute(
            select(models.DocumentShare).where(
                models.DocumentShare.document_id == doc_id,
                models.DocumentShare.doctor_id == payload.doctor_id,
            )
        ).scalar_one_or_none()
        if existing:
            existing.note = payload.note
            continue
        db.add(models.DocumentShare(
            document_id=doc_id,
            doctor_id=payload.doctor_id,
            patient_id=user.id,
            note=payload.note,
        ))
        shared_count += 1

    security.record_audit_event(db, user.id, user.id, "share_records", payload.doctor_id)
    db.commit()
    return {"shared_count": shared_count}


@router.delete("/me/documents/{document_id}/share/{doctor_id}", status_code=204)
def unshare_document(
    document_id: uuid.UUID,
    doctor_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    share = db.execute(
        select(models.DocumentShare).where(
            models.DocumentShare.document_id == document_id,
            models.DocumentShare.doctor_id == doctor_id,
            models.DocumentShare.patient_id == user.id,
        )
    ).scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    db.delete(share)
    security.record_audit_event(db, user.id, user.id, "unshare_document", document_id)
    db.commit()


@router.get("/me/notes", response_model=list[schemas.DoctorNoteOut])
def list_my_notes(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    """Full note content — the Timeline only shows a short summary that
    a note exists; this is how a patient actually reads what was written.
    """
    notes = db.execute(
        select(models.DoctorNote)
        .where(models.DoctorNote.patient_id == user.id)
        .order_by(models.DoctorNote.created_at.desc())
    ).scalars().all()
    return notes


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


@router.get("/me/share")
def list_my_shares(
    db: Session = Depends(get_db),
    user: models.User = Depends(require_patient),
):
    rows = db.execute(
        select(models.Permission, models.User)
        .join(models.User, models.User.id == models.Permission.doctor_id)
        .where(
            models.Permission.patient_id == user.id,
            models.Permission.status == models.PermissionStatus.active,
        )
    ).all()
    return [
        {
            "doctor_id": doctor.id,
            "doctor_name": doctor.full_name,
            "doctor_email": doctor.email,
            "granted_at": perm.granted_at,
        }
        for perm, doctor in rows
    ]


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
    rows = db.execute(
        select(models.AuditLog, models.User)
        .join(models.User, models.User.id == models.AuditLog.actor_id)
        .where(models.AuditLog.patient_id == user.id)
        .order_by(models.AuditLog.occurred_at.desc())
    ).all()
    return [
        {
            "actor_name": actor.full_name,
            "actor_role": actor.role.value,
            "action": entry.action,
            "occurred_at": entry.occurred_at,
        }
        for entry, actor in rows
    ]