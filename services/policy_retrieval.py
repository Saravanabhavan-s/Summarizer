"""
policy_retrieval.py — Tenant-Isolated RAG Retrieval
=====================================================
Retrieves policy context during call scoring using
Milvus vector search filtered by user_id.

Generates query embeddings using the same all-MiniLM-L6-v2 model
used for indexing — no paid API calls.

Flow:
  1. Embed the query/transcript using local model
  2. Search Milvus with expression filter: user_id == current_user
  3. Return top-k policy chunks as context string
"""

from typing import List, Dict, Optional
from langchain_core.documents import Document

from services.policy_embeddings import embed_query, get_collection

RETRIEVER_TOP_K = 4


def retrieve_policy_context(
    user_id: str,
    transcript: str,
    top_k: int = RETRIEVER_TOP_K,
) -> str:
    """
    Retrieve relevant policy chunks for a user's transcript.

    Strict tenant isolation: only returns chunks belonging to the user.

    Args:
        user_id: The authenticated user's ID (acts as org isolation key)
        transcript: Call transcript or query text
        top_k: Number of chunks to retrieve

    Returns:
        Concatenated policy context string (empty if no policies found)
    """
    if not transcript or not transcript.strip():
        return ""

    # Trim transcript for efficient embedding
    query_text = transcript[:2000]

    try:
        query_vector = embed_query(query_text)
        collection = get_collection()

        # Strict user_id filter — no cross-tenant contamination
        filter_expr = f'user_id == "{user_id}"'

        hits = collection.search(
            data=[query_vector],
            anns_field="vector",
            param={"metric_type": "COSINE", "params": {}},
            limit=top_k,
            expr=filter_expr,
            output_fields=["text", "policy_id", "category", "chunk_index"],
        )

        chunks: List[str] = []
        for hit in hits[0]:
            entity = hit.entity
            text = entity.get("text", "").strip()
            if text:
                chunks.append(text)

        policy_context = "\n\n".join(chunks)

        if chunks:
            print(
                f"[POLICY_RETRIEVAL] Retrieved {len(chunks)} chunk(s) "
                f"for user '{user_id}' ({len(policy_context)} chars)"
            )
        else:
            print(f"[POLICY_RETRIEVAL] No policy chunks found for user '{user_id}'")

        return policy_context

    except Exception as exc:
        print(f"[POLICY_RETRIEVAL][WARN] Retrieval failed: {exc}")
        return ""


def retrieve_policy_documents(
    user_id: str,
    query: str,
    top_k: int = RETRIEVER_TOP_K,
) -> List[Dict]:
    """
    Retrieve policy chunks as structured documents (for testing console).

    Returns list of dicts with text, policy_id, category, score.
    """
    if not query or not query.strip():
        return []

    try:
        query_vector = embed_query(query[:2000])
        collection = get_collection()

        filter_expr = f'user_id == "{user_id}"'

        hits = collection.search(
            data=[query_vector],
            anns_field="vector",
            param={"metric_type": "COSINE", "params": {}},
            limit=top_k,
            expr=filter_expr,
            output_fields=["text", "policy_id", "category", "chunk_index"],
        )

        results = []
        for hit in hits[0]:
            entity = hit.entity
            results.append({
                "text": entity.get("text", ""),
                "policy_id": entity.get("policy_id", ""),
                "category": entity.get("category", ""),
                "chunk_index": entity.get("chunk_index", -1),
                "score": round(float(hit.score), 4),
            })

        return results

    except Exception as exc:
        print(f"[POLICY_RETRIEVAL][WARN] Document retrieval failed: {exc}")
        return []
