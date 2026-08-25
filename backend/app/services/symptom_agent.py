"""The Symptom Checker's agent flow: Triage -> History Retrieval -> Reasoning.

Each API call runs this graph once against the conversation-so-far
(persisted in symptom_sessions.transcript between calls, since HTTP
requests are stateless). Triage decides whether it has enough
information; if not, it asks one follow-up question and the graph ends
there for this call. Once ready (or the round cap is hit), the graph
continues through Retrieval and Reasoning and produces a final answer.

MAX_TRIAGE_ROUNDS is a plain constant for now, not user-configurable —
flagged here as the spot to wire up a setting later if that's wanted.
"""
import json
from typing import TypedDict, Optional

from langgraph.graph import StateGraph, END
from groq import Groq
import os

from app.services import retrieval

MAX_TRIAGE_ROUNDS = 3

_client = Groq(api_key=os.getenv("GROQ_API_KEY"))


class SymptomState(TypedDict):
    patient_id: str
    transcript: list[dict]       # [{"role": "patient"|"agent", "message": str}]
    round_count: int
    status: Optional[str]        # "need_more_info" | "ready"
    follow_up_question: Optional[str]
    retrieval_query: Optional[str]
    retrieved_chunks: list[dict]
    final_summary: Optional[str]
    confidence: Optional[str]
    db: object                   # SQLAlchemy Session, threaded through state since
                                  # LangGraph nodes don't take extra args directly


_TRIAGE_SYSTEM_PROMPT = """You are the triage step of a medical symptom
checker. You never diagnose. Given the conversation so far (a patient
describing symptoms, possibly with prior follow-up answers), decide:

- If the description is vague or missing something clinically useful
  (duration, severity, location, associated symptoms), ask ONE specific
  follow-up question.
- If you have enough to search the patient's history and reason about it,
  mark it ready and write a short search query summarizing the symptoms.

Reply with ONLY valid JSON, no other text:
{"status": "need_more_info", "question": "..."}
or
{"status": "ready", "retrieval_query": "..."}
"""


def triage_node(state: SymptomState) -> SymptomState:
    if state["round_count"] >= MAX_TRIAGE_ROUNDS:
        # Cap hit — proceed with whatever we have rather than keep asking.
        summary_query = " ".join(t["message"] for t in state["transcript"] if t["role"] == "patient")
        state["status"] = "ready"
        state["retrieval_query"] = summary_query
        return state

    convo = "\n".join(f'{t["role"]}: {t["message"]}' for t in state["transcript"])
    response = _client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": _TRIAGE_SYSTEM_PROMPT},
            {"role": "user", "content": convo},
        ],
        temperature=0.2,
        max_tokens=150,
    )
    try:
        parsed = json.loads(response.choices[0].message.content)
    except (json.JSONDecodeError, TypeError):
        # If the model didn't return clean JSON, fail safe by proceeding
        # rather than getting stuck.
        parsed = {"status": "ready", "retrieval_query": convo}

    state["status"] = parsed.get("status", "ready")
    state["follow_up_question"] = parsed.get("question")
    state["retrieval_query"] = parsed.get("retrieval_query")
    return state


def retrieve_node(state: SymptomState) -> SymptomState:
    query = state["retrieval_query"] or state["transcript"][-1]["message"]
    state["retrieved_chunks"] = retrieval.retrieve_relevant_chunks(
        db=state["db"], patient_id=state["patient_id"], query=query, top_k=5
    )
    return state


_REASONING_SYSTEM_PROMPT = """You help a patient understand what their
symptoms might be worth discussing with a doctor, using relevant excerpts
from their own health history.

Rules you must follow:
- You never diagnose. Never say "you have X." Never tell them to start,
  stop, or change a medication.
- Ground your answer in the retrieved history where it's actually
  relevant. If the history isn't relevant to the symptoms, say so plainly
  rather than forcing a connection.
- State a confidence level (low / moderate / high) based on how directly
  the retrieved history relates to the symptoms described.
- End by suggesting what would be worth mentioning to their doctor.
- Keep it under 200 words.
"""


def reason_node(state: SymptomState) -> SymptomState:
    convo = "\n".join(f'{t["role"]}: {t["message"]}' for t in state["transcript"])

    relevant_chunks = [c for c in state["retrieved_chunks"] if c["similarity"] > 0.25]
    if relevant_chunks:
        history_text = "\n---\n".join(c["chunk_text"] for c in relevant_chunks)
    else:
        history_text = "(No closely related history found for these symptoms.)"

    response = _client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": _REASONING_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"Conversation:\n{convo}\n\nRelevant history:\n{history_text}",
            },
        ],
        temperature=0.3,
        max_tokens=500,
    )
    state["final_summary"] = response.choices[0].message.content

    if relevant_chunks and max(c["similarity"] for c in relevant_chunks) > 0.4:
        state["confidence"] = "moderate to high — grounded in related history"
    elif relevant_chunks:
        state["confidence"] = "low to moderate — some loosely related history found"
    else:
        state["confidence"] = "low — no related history found"

    return state


def _route_after_triage(state: SymptomState) -> str:
    return "retrieve" if state["status"] == "ready" else END


def build_graph():
    graph = StateGraph(SymptomState)
    graph.add_node("triage", triage_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("reason", reason_node)

    graph.set_entry_point("triage")
    graph.add_conditional_edges("triage", _route_after_triage, {"retrieve": "retrieve", END: END})
    graph.add_edge("retrieve", "reason")
    graph.add_edge("reason", END)

    return graph.compile()


_compiled_graph = None


def run_symptom_check(db, patient_id: str, transcript: list[dict], force_ready: bool = False) -> dict:
    """Runs one turn of the agent against the conversation so far.
    db is passed through state since LangGraph nodes don't take extra
    args directly — a bit unusual but keeps the graph signature simple.
    force_ready lets the user skip straight to an answer instead of
    another follow-up question — reuses the same round-cap path Triage
    already has, since "stop asking, just answer with what you have" is
    exactly what happens when the cap is hit.
    """
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph()

    round_count = sum(1 for t in transcript if t["role"] == "patient") - 1  # first message doesn't count as a "round"
    round_count = max(round_count, 0)
    if force_ready:
        round_count = MAX_TRIAGE_ROUNDS

    initial_state: SymptomState = {
        "patient_id": patient_id,
        "transcript": transcript,
        "round_count": round_count,
        "status": None,
        "follow_up_question": None,
        "retrieval_query": None,
        "retrieved_chunks": [],
        "final_summary": None,
        "confidence": None,
        "db": db,
    }

    result = _compiled_graph.invoke(initial_state)
    return result