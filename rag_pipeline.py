"""
RAG Pipeline — Customer Support Quality Auditor
================================================
Retrieval-Augmented Generation pipeline that loads company policy documents,
indexes them with Milvus vector search, and answers compliance-related queries
using an LLM backed by retrieved context.

Architecture:
    Documents → Chunking → Embeddings → Milvus Vector Store
    → Retriever → LLM (with context prompt) → Answer
"""

import os
from datetime import datetime
from typing import List

# ---------------------------------------------------------------------------
# 1. Imports — using latest non-deprecated LangChain packages
# ---------------------------------------------------------------------------
from langchain_openai import ChatOpenAI
from langchain_openai import OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.documents import Document
from pymilvus import Collection, CollectionSchema, DataType, FieldSchema, connections, utility

# ---------------------------------------------------------------------------
# 2. Configuration
# ---------------------------------------------------------------------------
# Replace with your actual OpenAI API key or set the environment variable.
os.environ.setdefault("OPENAI_API_KEY", "sk-YOUR-OPENAI-API-KEY-HERE")

POLICY_DOCUMENT_PATH = os.path.join(os.path.dirname(__file__), "policy.txt")
EMBEDDING_MODEL_NAME = "text-embedding-3-small"
MILVUS_URI = os.getenv("MILVUS_URI", "http://localhost:19530")
MILVUS_COLLECTION_NAME = os.getenv("MILVUS_COLLECTION_NAME", "policy_chunks")
MILVUS_ALIAS = os.getenv("MILVUS_ALIAS", "default")

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
# RAG connection: Step 1 of Documents → Chunking → Embeddings → Milvus → Retriever → LLM
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
# RAG connection: Step 2 — chunks are passed to the embedding model and then stored in Milvus.
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
# Purpose: Initialise the OpenAI embedding model
# Input: model_name (str) — OpenAI embedding model identifier
# Output: OpenAIEmbeddings — embedding model instance used for vectorising text
# Why needed: Embeddings convert text chunks into numerical vectors so that
#   semantically similar text can be found via cosine similarity in Milvus.
# RAG connection: Step 3 — embeddings are used both when indexing chunks and when
#   encoding the user query at retrieval time.
def create_embeddings(model_name: str = EMBEDDING_MODEL_NAME):
    """Step 3 — Initialise the OpenAI embedding model."""
    embeddings = OpenAIEmbeddings(model=model_name)
    print(f"[INFO] Embedding model loaded: {model_name}")
    return embeddings


# ---------------------------------------------------------------------------
# 4. Milvus Vector Store Layer
# ---------------------------------------------------------------------------


def _connect_milvus():
    """Connect to Milvus server and return active connection alias."""
    try:
        connections.connect(alias=MILVUS_ALIAS, uri=MILVUS_URI)
    except Exception as exc:
        raise RuntimeError(
            f"Failed to connect to Milvus at '{MILVUS_URI}'. "
            "Ensure local Milvus (Docker) is running."
        ) from exc
    return MILVUS_ALIAS


def _build_collection_schema(embedding_dim: int) -> CollectionSchema:
    fields = [
        FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
        FieldSchema(name="vector", dtype=DataType.FLOAT_VECTOR, dim=embedding_dim),
        FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=65535),
        FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=1024),
        FieldSchema(name="chunk_index", dtype=DataType.INT64),
    ]
    return CollectionSchema(fields=fields, description="Policy chunks for RAG retrieval")


def _get_or_create_collection(embedding_dim: int, recreate: bool = False) -> Collection:
    _connect_milvus()

    exists = utility.has_collection(MILVUS_COLLECTION_NAME, using=MILVUS_ALIAS)
    if exists and recreate:
        utility.drop_collection(MILVUS_COLLECTION_NAME, using=MILVUS_ALIAS)
        exists = False

    if not exists:
        schema = _build_collection_schema(embedding_dim)
        collection = Collection(
            name=MILVUS_COLLECTION_NAME,
            schema=schema,
            using=MILVUS_ALIAS,
        )
        create_index(collection)
        print(f"[INFO] Milvus collection created: {MILVUS_COLLECTION_NAME}")
    else:
        collection = Collection(MILVUS_COLLECTION_NAME, using=MILVUS_ALIAS)

    collection.load()
    return collection


def create_index(collection: Collection) -> None:
    """Create a cosine index in Milvus (no-op if already present)."""
    if collection.indexes:
        return

    collection.create_index(
        field_name="vector",
        index_params={
            "metric_type": "COSINE",
            "index_type": "AUTOINDEX",
            "params": {},
        },
    )


def add_documents(collection: Collection, chunks, embeddings) -> int:
    """Insert chunk embeddings and metadata into Milvus collection."""
    if not chunks:
        return 0

    texts = [doc.page_content for doc in chunks]
    vectors = embeddings.embed_documents(texts)
    sources = [str(doc.metadata.get("source", "")) for doc in chunks]
    chunk_indexes = [int(doc.metadata.get("chunk_index", idx)) for idx, doc in enumerate(chunks)]

    collection.insert([vectors, texts, sources, chunk_indexes])
    collection.flush()
    collection.load()
    return len(texts)


def search_documents(collection: Collection, embeddings, query: str, top_k: int = RETRIEVER_TOP_K) -> List[Document]:
    """Search top-k similar chunks in Milvus using cosine similarity."""
    query_vector = embeddings.embed_query(query)

    hits = collection.search(
        data=[query_vector],
        anns_field="vector",
        param={"metric_type": "COSINE", "params": {}},
        limit=top_k,
        output_fields=["text", "source", "chunk_index"],
    )

    docs: List[Document] = []
    for hit in hits[0]:
        entity = hit.entity
        docs.append(
            Document(
                page_content=entity.get("text", ""),
                metadata={
                    "source": entity.get("source", ""),
                    "chunk_index": entity.get("chunk_index", -1),
                    "score": float(hit.score),
                },
            )
        )
    return docs


class MilvusRetriever:
    """Retriever interface compatible with existing pipeline usage."""

    def __init__(self, collection: Collection, embeddings, top_k: int):
        self.collection = collection
        self.embeddings = embeddings
        self.top_k = top_k

    def invoke(self, query: str) -> List[Document]:
        return search_documents(self.collection, self.embeddings, query, top_k=self.top_k)


class MilvusVectorStore:
    """Minimal vector store wrapper preserving the existing retriever interface."""

    def __init__(self, collection: Collection, embeddings):
        self.collection = collection
        self.embeddings = embeddings

    @property
    def vector_count(self) -> int:
        return int(self.collection.num_entities)

    def as_retriever(self, search_type: str = "similarity", search_kwargs: dict = None):
        del search_type
        kwargs = search_kwargs or {}
        top_k = int(kwargs.get("k", RETRIEVER_TOP_K))
        return MilvusRetriever(self.collection, self.embeddings, top_k=top_k)


# Function: build_vector_store
# Purpose: Create a Milvus vector index from the embedded document chunks
# Input: chunks (list[Document]) — output from split_documents()
#        embeddings (OpenAIEmbeddings) — output from create_embeddings()
# Output: MilvusVectorStore — vector store wrapper over Milvus collection
# Why needed: Milvus provides scalable nearest-neighbour search so the retriever
#   can quickly find the most relevant policy sections for any query.
# RAG connection: Step 4 — the vector store is the backbone of the retrieval layer.
def build_vector_store(chunks, embeddings):
    """Step 4 — Create a Milvus vector store from document chunks."""
    if not chunks:
        raise ValueError("Cannot build vector store: no chunks were provided")

    probe_vector = embeddings.embed_query(chunks[0].page_content)
    collection = _get_or_create_collection(embedding_dim=len(probe_vector), recreate=True)
    inserted = add_documents(collection, chunks, embeddings)
    vector_store = MilvusVectorStore(collection, embeddings)
    print(f"[INFO] Milvus vector store ready with {vector_store.vector_count} vectors (inserted={inserted})")
    return vector_store


# Function: create_retriever
# Purpose: Wrap the Milvus vector store in a retriever interface
# Input: vector_store (MilvusVectorStore) — output from build_vector_store()
#        top_k (int) — number of most-similar chunks to return per query
# Output: MilvusRetriever — callable retriever that accepts a query string
# Why needed: The retriever is the interface the RAG chain (or the backend) calls
#   to fetch relevant policy text before sending it to the LLM.
# RAG connection: Step 5 — the retriever bridges Milvus and the LLM prompt.
def create_retriever(vector_store, top_k: int = RETRIEVER_TOP_K):
    """Step 5 — Build a retriever over the Milvus vector store."""
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
        1. Retrieves relevant policy chunks via the Milvus retriever.
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
# Subsequent calls to get_rag_response() reuse the pre-built Milvus collection and
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
    Internal helper — build the Milvus retriever once and cache it at module level.
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
    _retriever_meta["vectors"] = vector_store.vector_count
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
        "provider": "milvus",
        "policy_path": _retriever_meta["policy_path"],
        "chunks": _retriever_meta["chunks"],
        "vectors": _retriever_meta["vectors"],
        "last_rebuild": _retriever_meta["last_rebuild"],
    }


# Function: get_rag_response
# Purpose: Retrieve the most relevant company policy text for a given transcript
# Input: transcript (str) — the customer support call transcript or query text
# Output: str — concatenated policy context from the top-k Milvus matches
# Why needed: The backend calls this function BEFORE sending the transcript to the
#   LLM for evaluation. The returned policy context is injected into the LLM prompt
#   so that scoring is grounded in actual company rules — not generic assumptions.
# How it connects to RAG:
#   1. Lazily initialises the Milvus retriever (load → chunk → embed → index)
#   2. Queries the Milvus index with the transcript text
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

    # Retrieve top-k policy chunks from Milvus
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

    # Step 4: Store in Milvus
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
