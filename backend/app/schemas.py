"""Pydantic schemas for request/response bodies."""
import uuid
from datetime import datetime, date
from typing import Optional, Literal

from pydantic import BaseModel, EmailStr


# ── Auth ────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: Literal["patient", "doctor"]


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    is_verified: bool

    class Config:
        from_attributes = True

class DoctorPatientSummaryOut(UserOut):
    """UserOut plus at-a-glance stats for the doctor's patient list —
    what's shared, how much, and what's new since the doctor's last
    visit to that patient's timeline.
    """
    shared_document_count: int
    last_activity_at: Optional[datetime]
    new_items_count: int

    
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Timeline ────────────────────────────────────────────────────
class TimelineEntryOut(BaseModel):
    id: uuid.UUID
    entry_type: str
    ref_id: uuid.UUID
    occurred_at: datetime
    summary: str

    class Config:
        from_attributes = True


# ── Documents ───────────────────────────────────────────────────
class DocumentUpload(BaseModel):
    """Client encrypts the file locally (AES-256-GCM) before this call —
    the server only ever stores ciphertext + the IV/auth tag needed to
    decrypt it, never plaintext.
    """
    doc_type: Literal["report", "prescription", "other"]
    file_url: str      # pointer to already-uploaded encrypted blob
    iv: str
    auth_tag: str
    original_filename: Optional[str] = None


class DocumentOut(BaseModel):
    id: uuid.UUID
    doc_type: str
    original_filename: Optional[str]
    uploaded_at: datetime

    class Config:
        from_attributes = True


class AskQuestionRequest(BaseModel):
    question: str


# ── Permissions / sharing ──────────────────────────────────────
class GrantAccessRequest(BaseModel):
    doctor_email: EmailStr


class PermissionOut(BaseModel):
    id: uuid.UUID
    doctor_id: uuid.UUID
    status: str
    granted_at: datetime

    class Config:
        from_attributes = True


# ── Doctor notes ────────────────────────────────────────────────
class DoctorNoteCreate(BaseModel):
    note: str


class DoctorNoteOut(BaseModel):
    id: uuid.UUID
    doctor_id: uuid.UUID
    note: str
    created_at: datetime

    class Config:
        from_attributes = True


class BabyProfileCreate(BaseModel):
    name: str
    date_of_birth: date
    sex: Optional[Literal["male", "female"]] = None


class BabyProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    date_of_birth: date
    sex: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class GrowthEntryCreate(BaseModel):
    recorded_at: date
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None
    head_circ_cm: Optional[float] = None
    notes: Optional[str] = None


class GrowthEntryOut(BaseModel):
    id: uuid.UUID
    recorded_at: date
    weight_kg: Optional[float]
    height_cm: Optional[float]
    head_circ_cm: Optional[float]
    notes: Optional[str]
    age_months: float
    weight_percentile: Optional[float] = None
    weight_percentile_label: Optional[str] = None
    height_percentile: Optional[float] = None
    height_percentile_label: Optional[str] = None

class MilestoneOut(BaseModel):
    key: str
    name: str
    kind: Literal["vaccine", "checkup"]
    age_label: str
    due_date: date
    status: Literal["completed", "overdue", "due_soon", "upcoming"]
    completed_at: Optional[date] = None
    notes: Optional[str] = None


class MilestoneCompleteRequest(BaseModel):
    completed_at: date
    notes: Optional[str] = None