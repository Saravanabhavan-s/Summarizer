"""
RAG Pipeline — Customer Support Quality Auditor
================================================
Retrieval-Augmented Generation pipeline that loads company policy documents,
indexes them with FAISS vector search, and answers compliance-related queries
using an LLM backed by retrieved context.

Architecture:
    Documents → Chunking → Embeddings → FAISS Vector Store
    → Retriever → LLM (with context prompt) → Answer
"""

import os
from datetime import datetime
from typing import List

# ---------------------------------------------------------------------------
# 1. Imports — using latest non-deprecated LangChain packages
# ---------------------------------------------------------------------------
from langchain_community.vectorstores import FAISS
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.documents import Document

# ---------------------------------------------------------------------------
# 2. Configuration
# ---------------------------------------------------------------------------
# Replace with your actual OpenAI API key or set the environment variable.
os.environ.setdefault("OPENAI_API_KEY", "sk-YOUR-OPENAI-API-KEY-HERE")

POLICY_DOCUMENT_PATH = os.path.join(os.path.dirname(__file__), "policy.txt")
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# Chunking parameters tuned for policy documents (~paragraph-level chunks)
CHUNK_SIZE = 300
CHUNK_OVERLAP = 50

# Retriever settings
RETRIEVER_TOP_K = 3

# LLM settings
LLM_MODEL = "gpt-4o"
LLM_TEMPERATURE = 0  # deterministic output for compliance auditing


# Function: load_document
# Purpose: Load the raw policy document from disk into LangChain Document objects
# Input: file_path (str) — absolute or relative path to the .txt policy file
# Output: list[Document] — list of LangChain Document objects with page_content and metadata
# Why needed: This is the entry point of the RAG pipeline. The policy text must be
#   loaded before it can be chunked, embedded, and indexed in the vector store.
# RAG connection: Step 1 of Documents → Chunking → Embeddings → FAISS → Retriever → LLM
def load_document(file_path: str):
    """Step 1 — Load the policy document from disk."""
    with open(file_path, "r", encoding="utf-8") as f:
        policy_text = f.read()

    documents = [Document(page_content=policy_text, metadata={"source": file_path})]
    print(f"[INFO] Loaded {len(documents)} document(s) from '{file_path}'")
    return documents


# Function: split_documents
# Purpose: Break the loaded document into smaller, overlapping chunks for accurate embedding
# Input: documents (list[Document]) — output from load_document()
#        chunk_size (int) — max characters per chunk (default 300)
#        chunk_overlap (int) — overlap between consecutive chunks (default 50)
# Output: list[Document] — list of chunked Document objects
# Why needed: Embedding models have token limits and perform better on focused text.
#   Overlapping chunks ensure that sentences at chunk boundaries are not lost.
# RAG connection: Step 2 — chunks are passed to the embedding model and then stored in FAISS.
def split_documents(documents, chunk_size: int = CHUNK_SIZE, chunk_overlap: int = CHUNK_OVERLAP):
    """Step 2 — Split the document into manageable chunks for embedding."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")

    if chunk_overlap < 0:
        raise ValueError("chunk_overlap must be >= 0")

    if chunk_overlap >= chunk_size:
        # Prevent infinite loops in sliding-window chunking.
        chunk_overlap = max(0, chunk_size // 5)

    source_path = "policy.txt"
    full_text = "\n\n".join(doc.page_content for doc in documents if doc.page_content)
    if documents and isinstance(documents[0].metadata, dict):
        source_path = documents[0].metadata.get("source", source_path)

    full_text = full_text.replace("\r\n", "\n").strip()
    if not full_text:
        return []

    chunk_texts: List[str] = []
    start = 0
    text_len = len(full_text)

    while start < text_len:
        end = min(start + chunk_size, text_len)

        if end < text_len:
            search_floor = start + max(1, chunk_size // 2)
            breakpoints = ["\n\n", "\n", ". ", " "]
            for marker in breakpoints:
                bp = full_text.rfind(marker, search_floor, end)
                if bp != -1:
                    end = bp + len(marker)
                    break

        if end <= start:
            end = min(start + chunk_size, text_len)

        chunk = full_text[start:end].strip()
        if chunk:
            chunk_texts.append(chunk)

        if end >= text_len:
            break

        start = max(0, end - chunk_overlap)

    chunks = [
        Document(
            page_content=chunk_text,
            metadata={"source": source_path, "chunk_index": idx},
        )
        for idx, chunk_text in enumerate(chunk_texts)
    ]

    print(f"[INFO] Split into {len(chunks)} chunk(s)  (size={chunk_size}, overlap={chunk_overlap})")
    return chunks


# Function: create_embeddings
# Purpose: Initialise the HuggingFace sentence-transformer embedding model
# Input: model_name (str) — HuggingFace model identifier (default: all-MiniLM-L6-v2)
# Output: HuggingFaceEmbeddings — embedding model instance used for vectorising text
# Why needed: Embeddings convert text chunks into numerical vectors so that
#   semantically similar text can be found via cosine similarity in FAISS.
# RAG connection: Step 3 — embeddings are used both when indexing chunks and when
#   encoding the user query at retrieval time.
def create_embeddings(model_name: str = EMBEDDING_MODEL_NAME):
    """Step 3 — Initialise the HuggingFace embedding model."""
    from langchain_huggingface import HuggingFaceEmbeddings

    embeddings = HuggingFaceEmbeddings(
        model_name=model_name,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
    print(f"[INFO] Embedding model loaded: {model_name}")
    return embeddings


# Function: build_vector_store
# Purpose: Create a FAISS vector index from the embedded document chunks
# Input: chunks (list[Document]) — output from split_documents()
#        embeddings (HuggingFaceEmbeddings) — output from create_embeddings()
# Output: FAISS — a LangChain FAISS vector store containing all chunk vectors
# Why needed: FAISS provides fast approximate nearest-neighbour search so the
#   retriever can quickly find the most relevant policy sections for any query.
# RAG connection: Step 4 — the vector store is the backbone of the retrieval layer.
def build_vector_store(chunks, embeddings):
    """Step 4 — Create a FAISS vector store from document chunks."""
    vector_store = FAISS.from_documents(chunks, embeddings)
    print(f"[INFO] FAISS vector store created with {vector_store.index.ntotal} vectors")
    return vector_store


# Function: create_retriever
# Purpose: Wrap the FAISS vector store in a LangChain retriever interface
# Input: vector_store (FAISS) — output from build_vector_store()
#        top_k (int) — number of most-similar chunks to return per query
# Output: VectorStoreRetriever — callable retriever that accepts a query string
# Why needed: The retriever is the interface the RAG chain (or the backend) calls
#   to fetch relevant policy text before sending it to the LLM.
# RAG connection: Step 5 — the retriever bridges FAISS and the LLM prompt.
def create_retriever(vector_store, top_k: int = RETRIEVER_TOP_K):
    """Step 5 — Build a retriever over the FAISS vector store."""
    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": top_k},
    )
    print(f"[INFO] Retriever ready  (top_k={top_k})")
    return retriever


# Function: build_rag_chain
# Purpose: Assemble the full LCEL Retrieval-QA chain (retriever → prompt → LLM → output)
# Input: retriever (VectorStoreRetriever) — output from create_retriever()
#        model (str) — OpenAI model name
#        temperature (float) — LLM sampling temperature
# Output: RunnableSequence — an invocable LCEL chain that accepts a query string
# Why needed: This is the end-to-end RAG chain for standalone question-answering
#   over policy documents. It is also used when running rag_pipeline.py directly.
# RAG connection: Step 6 — combines retrieval + LLM into a single callable chain.
def build_rag_chain(retriever, model: str = LLM_MODEL, temperature: float = LLM_TEMPERATURE):
    """
    Step 6 — Build a Retrieval-QA chain using LangChain Expression Language (LCEL).

    This is the modern, non-deprecated replacement for the legacy RetrievalQA chain.
    The chain:
        1. Retrieves relevant policy chunks via the FAISS retriever.
        2. Formats them into a context block.
        3. Passes context + question to the LLM via a structured prompt.
        4. Parses the LLM output to a plain string.
    """
    # LLM
    llm = ChatOpenAI(model=model, temperature=temperature)

    # Prompt template designed for compliance auditing
    prompt = ChatPromptTemplate.from_template(
        "You are a Customer Support Quality Auditor. "
        "Use ONLY the following company policy context to answer the question. "
        "If the answer cannot be determined from the context, say so explicitly.\n\n"
        "--- POLICY CONTEXT ---\n{context}\n--- END CONTEXT ---\n\n"
        "Question: {question}\n"
        "Answer:"
    )

    def format_docs(docs):
        """Join retrieved document chunks into a single context string."""
        return "\n\n".join(doc.page_content for doc in docs)

    # LCEL Retrieval-QA chain
    rag_chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    print("[INFO] RAG chain assembled (LCEL RetrievalQA)")
    return rag_chain


# Function: ask_query
# Purpose: Send a natural-language query through the full RAG chain and return the answer
# Input: rag_chain (RunnableSequence) — output from build_rag_chain()
#        query (str) — the user's question
# Output: str — the LLM's answer grounded in retrieved policy context
# Why needed: Convenience wrapper used when running rag_pipeline.py as a standalone script.
# RAG connection: Step 7 — triggers retrieval + LLM generation in one call.
def ask_query(rag_chain, query: str) -> str:
    """Step 7 — Invoke the RAG chain with a user query and return the answer."""
    print(f"\n[QUERY] {query}")
    result = rag_chain.invoke(query)
    return result


# ===========================================================================
# Backend Integration — Singleton Initialisation & get_rag_response()
# ===========================================================================
# The objects below are initialised ONCE when this module is first imported.
# Subsequent calls to get_rag_response() reuse the pre-built FAISS index and
# retriever, avoiding redundant file I/O and embedding computation on every
# API request.
# ===========================================================================

# Module-level singletons (initialised on first import)
_retriever = None
_retriever_meta = {
    "policy_path": POLICY_DOCUMENT_PATH,
    "chunks": 0,
    "vectors": 0,
    "last_rebuild": None,
}


def _init_retriever():
    """
    Internal helper — build the FAISS retriever once and cache it at module level.
    Called lazily the first time get_rag_response() is invoked.
    """
    global _retriever
    if _retriever is not None:
        return _retriever

    documents = load_document(_retriever_meta["policy_path"])
    chunks = split_documents(documents)
    embeddings = create_embeddings()
    vector_store = build_vector_store(chunks, embeddings)
    _retriever = create_retriever(vector_store)
    _retriever_meta["chunks"] = len(chunks)
    _retriever_meta["vectors"] = vector_store.index.ntotal
    _retriever_meta["last_rebuild"] = datetime.utcnow().isoformat()
    return _retriever


def get_policy_path() -> str:
    """Return active policy file path used by retriever."""
    return _retriever_meta["policy_path"]


def set_policy_path(policy_path: str) -> None:
    """Set active policy path for future retriever rebuilds."""
    if policy_path:
        _retriever_meta["policy_path"] = policy_path


def rebuild_retriever(policy_path: str = None) -> dict:
    """
    Force a complete retriever rebuild from the active policy file.
    Returns rebuild metadata.
    """
    global _retriever

    if policy_path:
        _retriever_meta["policy_path"] = policy_path

    _retriever = None
    _init_retriever()
    return {
        "status": "rebuilt",
        "policy_path": _retriever_meta["policy_path"],
        "chunks": _retriever_meta["chunks"],
        "vectors": _retriever_meta["vectors"],
        "last_rebuild": _retriever_meta["last_rebuild"],
    }


def get_rag_status() -> dict:
    """Return retriever status metadata for admin dashboard."""
    return {
        "status": "ready" if _retriever is not None else "idle",
        "provider": "faiss",
        "policy_path": _retriever_meta["policy_path"],
        "chunks": _retriever_meta["chunks"],
        "vectors": _retriever_meta["vectors"],
        "last_rebuild": _retriever_meta["last_rebuild"],
    }


# Function: get_rag_response
# Purpose: Retrieve the most relevant company policy text for a given transcript
# Input: transcript (str) — the customer support call transcript or query text
# Output: str — concatenated policy context from the top-k FAISS matches
# Why needed: The backend calls this function BEFORE sending the transcript to the
#   LLM for evaluation. The returned policy context is injected into the LLM prompt
#   so that scoring is grounded in actual company rules — not generic assumptions.
# How it connects to RAG:
#   1. Lazily initialises the FAISS retriever (load → chunk → embed → index)
#   2. Queries the FAISS index with the transcript text
#   3. Returns the retrieved policy passages as a single context string
#   This is the primary integration point between the backend and the RAG pipeline.
def get_rag_response(transcript: str) -> str:
    """
    Retrieve relevant policy context for a given transcript.

    This is the main entry point used by the backend (main.py / call_quality_scorer.py)
    to fetch policy-grounded context before LLM evaluation.

    Args:
        transcript: The call transcript or a specific compliance question.

    Returns:
        A string containing the most relevant policy sections joined by newlines.
    """
    retriever = _init_retriever()

    # Build a focused retrieval query from the transcript
    # Trim to a reasonable length to keep the embedding efficient
    query = transcript[:2000]

    # Retrieve top-k policy chunks from FAISS
    docs = retriever.invoke(query)

    # Join chunk texts into a single context block
    policy_context = "\n\n".join(doc.page_content for doc in docs)
    print(f"[RAG] Retrieved {len(docs)} policy chunk(s) ({len(policy_context)} chars)")
    return policy_context


# ---------------------------------------------------------------------------
# Main execution (standalone mode)
# ---------------------------------------------------------------------------
def main():
    # Step 1: Load document
    documents = load_document(POLICY_DOCUMENT_PATH)

    # Step 2: Split document into chunks
    chunks = split_documents(documents)

    # Step 3: Create embeddings
    embeddings = create_embeddings()

    # Step 4: Store in FAISS
    vector_store = build_vector_store(chunks, embeddings)

    # Step 5: Create retriever
    retriever = create_retriever(vector_store)

    # Step 6: Create RAG chain (LCEL-based RetrievalQA)
    rag_chain = build_rag_chain(retriever)

    # Step 7: Ask query & Step 8: Print result
    query = "Did the agent violate refund policy?"
    answer = ask_query(rag_chain, query)
    print(f"\n[ANSWER]\n{answer}")


if __name__ == "__main__":
    main()
