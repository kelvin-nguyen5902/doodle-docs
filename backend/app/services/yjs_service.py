"""In-memory Yjs CRDT authority, holding one Y.Doc per document that's
currently open. Only safe as a single process, matching sockets.py's
room_members pattern."""

import time
from threading import Lock

from pycrdt import Doc, XmlElement, XmlFragment, XmlText

from . import documents_service

# Must match the Collaboration extension's field name on the frontend.
YJS_ROOT_KEY = "default"

CHECKPOINT_IDLE_SECONDS = 2
CHECKPOINT_MAX_WAIT_SECONDS = 10

_docs: dict[str, dict] = {}
_lock = Lock()


def _visible_text_length(node) -> int:
    """Counts the plain text characters under a pycrdt XML node."""
    if isinstance(node, XmlText):
        return len(node)
    children = getattr(node, "children", None)
    if children is None:
        return 0
    return sum(_visible_text_length(c) for c in children)


def _visible_plain_text(node) -> str:
    """Extracts the plain text under a pycrdt XML node, dropping mark tags."""
    if isinstance(node, XmlText):
        return "".join(seg for seg, _attrs in node.diff())
    children = getattr(node, "children", None)
    if children is None:
        return ""
    return "".join(_visible_plain_text(c) for c in children)


def decode_bytea(value) -> bytes:
    """Decodes a Postgres bytea value into raw bytes."""
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, str) and value.startswith("\\x"):
        return bytes.fromhex(value[2:])
    raise ValueError(f"unexpected content_ydoc format: {type(value)!r}")


def encode_bytea(data: bytes) -> str:
    """Encodes raw bytes into Postgres bytea's hex escape text format."""
    return "\\x" + data.hex()


def _new_doc_from_bytes(raw: bytes):
    """Builds a fresh Y.Doc from an encoded Yjs update."""
    doc = Doc()
    frag = doc.get(YJS_ROOT_KEY, type=XmlFragment)
    doc.apply_update(raw)
    return doc, frag


def load_or_create(doc_id: str):
    """Loads a document's CRDT state into memory, or reports it needs seeding."""
    with _lock:
        entry = _docs.get(doc_id)
        if entry is not None:
            return "ready", entry

        row = documents_service.fetch_document(doc_id)
        ydoc_value = row.get("content_ydoc") if row else None
        if not ydoc_value:
            return "needs_seed", None

        doc, frag = _new_doc_from_bytes(decode_bytea(ydoc_value))
        entry = _fresh_entry(doc, frag)
        _docs[doc_id] = entry
        return "ready", entry


def _fresh_entry(doc, frag) -> dict:
    """Builds a new in-memory entry for a document's Y.Doc."""
    now = time.time()
    return {"doc": doc, "frag": frag, "dirty": False, "last_update": now, "dirty_since": None, "html": None}


def apply_update(doc_id: str, update: bytes, max_chars: int) -> tuple[bool, str | None]:
    """Applies a client update to the authoritative doc, rejecting it if that
    would push visible text over max_chars."""
    with _lock:
        entry = _docs.get(doc_id)
        if entry is None:
            return False, "document not loaded"

        doc = entry["doc"]
        before = doc.get_update()
        doc.apply_update(update)

        length = _visible_text_length(entry["frag"])
        if length > max_chars:
            doc, frag = _new_doc_from_bytes(before)
            entry["doc"] = doc
            entry["frag"] = frag
            return False, f"documents are limited to {max_chars} characters"

        now = time.time()
        if not entry["dirty"]:
            entry["dirty_since"] = now
        entry["dirty"] = True
        entry["last_update"] = now
        return True, None


def encode_full_state(doc_id: str) -> bytes | None:
    """Returns the full encoded Yjs state for a document, if it's loaded."""
    entry = _docs.get(doc_id)
    if entry is None:
        return None
    return entry["doc"].get_update()


def seed_if_empty(doc_id: str, update: bytes) -> bool:
    """Race safely adopts a client's proposed initial state for a new document."""
    won = documents_service.seed_ydoc_if_null(doc_id, encode_bytea(update))
    if not won:
        return False
    with _lock:
        doc, frag = _new_doc_from_bytes(update)
        _docs[doc_id] = _fresh_entry(doc, frag)
    return True


def set_pending_html(doc_id: str, html: str | None) -> None:
    """Stashes the client's latest HTML snapshot for the next checkpoint."""
    if not html:
        return
    entry = _docs.get(doc_id)
    if entry is not None:
        entry["html"] = html


def checkpoint(doc_id: str) -> None:
    """Persists a document's in-memory state and latest HTML snapshot to Postgres."""
    with _lock:
        entry = _docs.get(doc_id)
        if entry is None or not entry["dirty"]:
            return
        ydoc_bytes = entry["doc"].get_update()
        html = entry["html"]
        entry["dirty"] = False
        entry["dirty_since"] = None
    documents_service.persist_ydoc(doc_id, encode_bytea(ydoc_bytes), html)


def sweep_and_checkpoint_stale() -> None:
    """Checkpoints any dirty document that's gone idle or been dirty too long."""
    now = time.time()
    for doc_id in all_doc_ids():
        entry = _docs.get(doc_id)
        if entry is None or not entry["dirty"]:
            continue
        idle = now - entry["last_update"]
        total_dirty = now - (entry["dirty_since"] or now)
        if idle >= CHECKPOINT_IDLE_SECONDS or total_dirty >= CHECKPOINT_MAX_WAIT_SECONDS:
            checkpoint(doc_id)


def evict(doc_id: str) -> None:
    """Drops a document's in-memory state."""
    with _lock:
        _docs.pop(doc_id, None)


def all_doc_ids() -> list[str]:
    """Lists every document currently held in memory."""
    with _lock:
        return list(_docs.keys())


def checkpoint_all() -> None:
    """Checkpoints every open document. Runs on graceful shutdown."""
    for doc_id in all_doc_ids():
        checkpoint(doc_id)
