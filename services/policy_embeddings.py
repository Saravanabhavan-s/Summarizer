"""
policy_embeddings.py — Lightweight Embedding & Milvus Sync
===========================================================
Generates embeddings using sentence-transformers/all-MiniLM-L6-v2 (384-dim)
and syncs them to a shared Milvus collection with user_id-based isolation.

Key design decisions:
  • all-MiniLM-L6-v2 chosen for Docker-friendly deployment (~80 MB model).
  • Single Milvus collection ``policy_workspace_vectors`` with metadata
    filtering by ``user_id`` — no per-user collections.
  • organization_id field reserved (empty string for now) to support
    future multi-tenant migration without schema changes.
"""

import os
import hashlib
from datetime import datetime
from typing import List, Dict, Optional, Tuple

from pymilvus import (
    Collection,
    CollectionSchema,
    DataType,
    FieldSchema,
    connections,
    utility,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2 output dimension

MILVUS_URI = os.getenv("MILVUS_URI", "http://localhost:19530")
MILVUS_TOKEN = os.getenv("MILVUS_TOKEN", "")
MILVUS_ALIAS = os.getenv("MILVUS_ALIAS", "policy_ws")
POLICY_COLLECTION_NAME = os.getenv(
    "POLICY_WS_COLLECTION", "policy_workspace_vectors"
)

# Chunking parameters — paragraph-level for policy documents
CHUNK_SIZE = 350
CHUNK_OVERLAP = 60

# ---------------------------------------------------------------------------
# Singleton Embedding Model
# ---------------------------------------------------------------------------

_model = None


def _get_model():
    """Lazy-load the sentence-transformers model once."""
    global _model
    if _model is not None:
        return _model

    try:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer(EMBEDDING_MODEL_NAME)
        print(f"[EMBEDDINGS] Loaded model: {EMBEDDING_MODEL_NAME}  (dim={EMBEDDING_DIM})")
    except Exception as exc:
        raise RuntimeError(
            f"Failed to load embedding model '{EMBEDDING_MODEL_NAME}'. "
            "Ensure sentence-transformers is installed: pip install sentence-transformers"
        ) from exc

    return _model


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a list of text strings and return vectors (384-dim each)."""
    if not texts:
        return []
    model = _get_model()
    vectors = model.encode(texts, show_progress_bar=False, normalize_embeddings=True)
    return vectors.tolist()


def embed_query(query: str) -> List[float]:
    """Embed a single query string for Milvus search."""
    model = _get_model()
    vector = model.encode([query], show_progress_bar=False, normalize_embeddings=True)
    return vector[0].tolist()


# ---------------------------------------------------------------------------
# Text Chunking
# ---------------------------------------------------------------------------


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
) -> List[str]:
    """
    Split text into overlapping chunks for embedding.

    Returns list of non-empty chunk strings.
    """
    if not text or not text.strip():
        return []

    text = text.replace("\r\n", "\n").strip()
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    if chunk_overlap < 0:
        chunk_overlap = 0
    if chunk_overlap >= chunk_size:
        chunk_overlap = max(0, chunk_size // 5)

    chunks: List[str] = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + chunk_size, text_len)

        # Try to break at natural boundaries
        if end < text_len:
            search_floor = start + max(1, chunk_size // 2)
            for marker in ("\n\n", "\n", ". ", " "):
                bp = text.rfind(marker, search_floor, end)
                if bp != -1:
                    end = bp + len(marker)
                    break

        if end <= start:
            end = min(start + chunk_size, text_len)

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= text_len:
            break
        start = max(0, end - chunk_overlap)

    return chunks


# ---------------------------------------------------------------------------
# Milvus Connection & Collection Management
# ---------------------------------------------------------------------------


def _connect_milvus():
    """Establish Milvus connection (idempotent)."""
    try:
        kwargs = {"alias": MILVUS_ALIAS, "uri": MILVUS_URI}
        if MILVUS_TOKEN:
            kwargs["token"] = MILVUS_TOKEN
        connections.connect(**kwargs)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to connect to Milvus at '{MILVUS_URI}'. "
            "Ensure Milvus/Zilliz Cloud is accessible."
        ) from exc


def _build_schema() -> CollectionSchema:
    """Build the Milvus collection schema for policy workspace vectors."""
    fields = [
        FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
        FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=EMBEDDING_DIM),
        FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
        FieldSchema(name="policy_id", dtype=DataType.VARCHAR, max_length=128),
        FieldSchema(name="user_id", dtype=DataType.VARCHAR, max_length=128),
        FieldSchema(
            name="organization_id", dtype=DataType.VARCHAR, max_length=128
        ),  # nullable — empty string for now
        FieldSchema(name="category", dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="chunk_index", dtype=DataType.INT64),
        FieldSchema(name="version", dtype=DataType.INT64),
    ]
    return CollectionSchema(
        fields=fields,
        description="Policy workspace vectors with per-user isolation",
    )


def _get_or_create_collection(recreate: bool = False) -> Collection:
    """Get existing collection or create with schema + index."""
    _connect_milvus()

    exists = utility.has_collection(POLICY_COLLECTION_NAME, using=MILVUS_ALIAS)
    if exists and recreate:
        utility.drop_collection(POLICY_COLLECTION_NAME, using=MILVUS_ALIAS)
        exists = False

    if not exists:
        schema = _build_schema()
        collection = Collection(
            name=POLICY_COLLECTION_NAME,
            schema=schema,
            using=MILVUS_ALIAS,
        )
        # Create cosine similarity index on vector field
        collection.create_index(
            field_name="vector",
            index_params={
                "metric_type": "COSINE",
                "index_type": "AUTOINDEX",
                "params": {},
            },
        )
        print(f"[EMBEDDINGS] Created Milvus collection: {POLICY_COLLECTION_NAME}")
    else:
        collection = Collection(POLICY_COLLECTION_NAME, using=MILVUS_ALIAS)

    collection.load()
    return collection


def get_collection() -> Collection:
    """Public accessor — returns the loaded Milvus collection."""
    return _get_or_create_collection(recreate=False)


# ---------------------------------------------------------------------------
# Embed & Upsert
# ---------------------------------------------------------------------------


def embed_policy(
    policy_id: str,
    user_id: str,
    text_content: str,
    category: str = "custom",
    version: int = 1,
    organization_id: str = "",
) -> Dict:
    """
    Chunk a policy document, embed it, and upsert to Milvus.

    Returns metadata about the operation:
        {"chunks": int, "vectors_inserted": int, "policy_id": str}
    """
    # 1. Remove old vectors for this policy+user
    delete_policy_embeddings(policy_id, user_id)

    # 2. Chunk the text
    chunks = chunk_text(text_content)
    if not chunks:
        return {"chunks": 0, "vectors_inserted": 0, "policy_id": policy_id}

    # 3. Generate embeddings locally (no paid API)
    vectors = embed_texts(chunks)

    # 4. Insert into Milvus
    collection = get_collection()

    insert_data = [
        vectors,                                          # vector
        chunks,                                           # text
        [policy_id] * len(chunks),                        # policy_id
        [user_id] * len(chunks),                          # user_id
        [organization_id] * len(chunks),                  # organization_id
        [category] * len(chunks),                         # category
        list(range(len(chunks))),                          # chunk_index
        [version] * len(chunks),                          # version
    ]

    collection.insert(insert_data)
    collection.flush()

    print(
        f"[EMBEDDINGS] Embedded policy '{policy_id}' for user '{user_id}': "
        f"{len(chunks)} chunks → {len(vectors)} vectors"
    )

    return {
        "chunks": len(chunks),
        "vectors_inserted": len(vectors),
        "policy_id": policy_id,
    }


def delete_policy_embeddings(policy_id: str, user_id: str) -> int:
    """
    Delete all vectors for a specific policy belonging to a user.
    Returns count of deleted entities.
    """
    try:
        collection = get_collection()
        expr = f'policy_id == "{policy_id}" and user_id == "{user_id}"'
        result = collection.delete(expr)
        collection.flush()
        deleted = getattr(result, "delete_count", 0)
        if deleted:
            print(f"[EMBEDDINGS] Deleted {deleted} vectors for policy '{policy_id}'")
        return deleted
    except Exception as exc:
        print(f"[EMBEDDINGS][WARN] Failed to delete vectors for '{policy_id}': {exc}")
        return 0


def delete_all_user_embeddings(user_id: str) -> int:
    """Delete ALL policy vectors belonging to a user."""
    try:
        collection = get_collection()
        expr = f'user_id == "{user_id}"'
        result = collection.delete(expr)
        collection.flush()
        deleted = getattr(result, "delete_count", 0)
        print(f"[EMBEDDINGS] Deleted {deleted} vectors for user '{user_id}'")
        return deleted
    except Exception as exc:
        print(f"[EMBEDDINGS][WARN] Failed to delete user vectors: {exc}")
        return 0


def re_embed_all_policies(user_id: str, policies: List[Dict]) -> Dict:
    """
    Rebuild all vectors for a user from a list of policy dicts.

    Each policy dict must have: policy_id, content, category, current_version

    Returns: {"total_chunks": int, "total_vectors": int, "policies_processed": int}
    """
    # Wipe all existing vectors for this user
    delete_all_user_embeddings(user_id)

    total_chunks = 0
    total_vectors = 0

    for policy in policies:
        result = embed_policy(
            policy_id=str(policy["policy_id"]),
            user_id=user_id,
            text_content=policy["content"],
            category=policy.get("category", "custom"),
            version=policy.get("current_version", 1),
        )
        total_chunks += result["chunks"]
        total_vectors += result["vectors_inserted"]

    return {
        "total_chunks": total_chunks,
        "total_vectors": total_vectors,
        "policies_processed": len(policies),
    }


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


def get_embedding_status() -> Dict:
    """Return embedding system status for admin/debug."""
    try:
        collection = get_collection()
        count = collection.num_entities
    except Exception:
        count = -1

    return {
        "model": EMBEDDING_MODEL_NAME,
        "dimension": EMBEDDING_DIM,
        "collection": POLICY_COLLECTION_NAME,
        "milvus_uri": MILVUS_URI,
        "total_vectors": count,
        "model_loaded": _model is not None,
    }
