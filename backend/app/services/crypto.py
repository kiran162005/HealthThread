"""Encryption-at-rest for uploaded documents.

INTERIM DESIGN NOTE: the original plan called for client-side AES-256-GCM
(server never sees plaintext at all). That's incompatible with server-side
OCR/extraction, which needs plaintext to read. This module encrypts
server-side instead: the server holds plaintext only transiently, in
memory, during the upload request — long enough to extract text — then
encrypts before anything touches disk. This is "encrypted at rest," not
full end-to-end encryption. If a stronger guarantee is needed later, the
real fix is running extraction client-side too, not just moving the
encryption step — flagged here so this doesn't quietly get described as
something it isn't.
"""
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# 32 raw bytes, base64-encoded, stored in .env. Generate one with:
#   python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
_KEY_B64 = os.getenv("ENCRYPTION_KEY")


def _get_key() -> bytes:
    if not _KEY_B64:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set in .env — generate one with "
            "`python -c \"import os,base64; print(base64.b64encode(os.urandom(32)).decode())\"`"
        )
    return base64.b64decode(_KEY_B64)


def encrypt_bytes(plaintext: bytes) -> tuple[bytes, str, str]:
    """Returns (ciphertext, iv_b64, ...). AESGCM appends the auth tag to the
    ciphertext itself, so we split it back out for storage symmetry with
    the schema's separate iv/auth_tag columns.
    """
    key = _get_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)  # 96-bit nonce, standard for GCM
    combined = aesgcm.encrypt(iv, plaintext, associated_data=None)
    ciphertext, tag = combined[:-16], combined[-16:]
    return ciphertext, base64.b64encode(iv).decode(), base64.b64encode(tag).decode()


def decrypt_bytes(ciphertext: bytes, iv_b64: str, tag_b64: str) -> bytes:
    key = _get_key()
    aesgcm = AESGCM(key)
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    return aesgcm.decrypt(iv, ciphertext + tag, associated_data=None)