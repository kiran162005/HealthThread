"""Turns raw extracted document text into a plain-language explanation.

Deliberately narrow prompt: explain and flag, never diagnose or instruct
(matches the safety framing in the project README) — the model is told
this explicitly, not just trusted to behave that way.
"""
import os
from groq import Groq

_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

_SYSTEM_PROMPT = """You explain medical reports and prescriptions in plain,
reassuring language for a patient with no medical background.

Rules you must follow:
- Explain what the document says and what the terms mean. Never diagnose,
  never say "you have X," never tell the patient to start, stop, or change
  a medication.
- If something looks like it's outside a normal range, say so factually
  and suggest discussing it with their doctor — don't editorialize about
  severity.
- Keep it to 3-5 short sentences. No medical jargon without a plain-language
  gloss next to it.
"""

def is_medical_document(raw_text: str) -> bool:
    """Cheap gate before spending a full explanation call — classifies
    whether the extracted text looks like a medical document at all
    (lab report, prescription, scan/imaging report, discharge summary,
    vaccination record). Keeps the explainer from confidently narrating
    an eviction notice or invoice as if it were a health document.
    """
    response = _client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {
                "role": "system",
                "content": (
                    "Classify the document. Reply with exactly one word: "
                    "MEDICAL or NOT_MEDICAL. MEDICAL means a lab report, "
                    "prescription, imaging/scan report, discharge summary, "
                    "vaccination record, or similar clinical document."
                ),
            },
            {"role": "user", "content": raw_text[:2000]},
        ],
        temperature=0,
        max_tokens=5,
    )
    return response.choices[0].message.content.strip().upper().startswith("MEDICAL")




def explain_document(raw_text: str) -> str:
    response = _client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Explain this document:\n\n{raw_text}"},
        ],
        temperature=0.3,
        max_tokens=700,
    )
    return response.choices[0].message.content