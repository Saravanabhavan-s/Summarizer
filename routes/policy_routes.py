"""
policy_routes.py — Policy Workspace API Router
=================================================
Dedicated FastAPI router for all policy management endpoints.
Accessible to all authenticated users (user-scoped isolation).
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from auth import get_current_user
from utils.text_parser import extract_text_from_file

from services.policy_service import (
    create_policy, get_policies, get_policy, update_policy_metadata,
    increment_version, set_version, archive_policy, restore_policy,
    delete_policy, get_policy_dashboard, record_evaluation_usage,
    POLICY_CATEGORIES,
)
from services.policy_version_manager import (
    create_version, list_versions, get_version, get_active_version,
    compare_versions, rollback_to_version, delete_all_versions,
)
from services.policy_summary_engine import (
    analyze_policy, get_insights, delete_insights, suggest_missing_policies,
)
from services.policy_embeddings import (
    embed_policy, delete_policy_embeddings, get_embedding_status,
)
from services.policy_retrieval import retrieve_policy_documents

import tempfile
import os

router = APIRouter(prefix="/policies", tags=["policies"])


# ---------------------------------------------------------------------------
# Request Models
# ---------------------------------------------------------------------------

class PolicyUpdateBody(BaseModel):
    content: str
    summary: str = ""

class PolicyMetadataBody(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None

class TestRetrievalBody(BaseModel):
    query: str
    top_k: int = 4


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@router.get("/dashboard")
async def policy_dashboard(user: dict = Depends(get_current_user)):
    """Policy dashboard stats for the current user."""
    dashboard = get_policy_dashboard(user["user_id"])
    return dashboard


# ---------------------------------------------------------------------------
# Policy CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_user_policies(
    category: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    user: dict = Depends(get_current_user),
):
    """List all policies for the current user."""
    policies = get_policies(user["user_id"], category=category, status=status)
    return {"policies": policies, "total": len(policies)}


@router.post("")
async def create_user_policy(
    file: UploadFile = File(...),
    name: str = Form(""),
    category: str = Form("custom"),
    user: dict = Depends(get_current_user),
):
    """Upload a new policy document."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Read and decode file content
    data = await file.read()
    temp_path = None

    try:
        # Try direct UTF-8 decode first
        try:
            text_content = data.decode("utf-8")
        except UnicodeDecodeError:
            # For PDF/DOCX, save to temp and extract
            suffix = os.path.splitext(file.filename or "")[1] or ".tmp"
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            tmp.write(data)
            tmp.close()
            temp_path = tmp.name
            text_content = extract_text_from_file(temp_path)

        if not text_content.strip():
            raise HTTPException(status_code=400, detail="Document is empty or could not be read")

        # Use filename as policy name if not provided
        policy_name = name.strip() or os.path.splitext(file.filename or "policy")[0]
        user_id = user["user_id"]

        # 1. Create policy record in MongoDB
        policy = create_policy(
            user_id=user_id, name=policy_name, category=category,
            content=text_content, file_name=file.filename or "",
        )
        policy_id = policy["policy_id"]

        # 2. Create version 1
        create_version(
            policy_id=policy_id, version=1, content=text_content,
            uploaded_by=user_id, summary="Initial upload",
        )

        # 3. Generate embeddings (local, free)
        embed_result = embed_policy(
            policy_id=policy_id, user_id=user_id,
            text_content=text_content, category=category, version=1,
        )

        # 4. AI analysis (async-friendly, uses LLM)
        insights = analyze_policy(policy_id=policy_id, text_content=text_content, version=1)

        return JSONResponse(status_code=201, content={
            "success": True,
            "policy": policy,
            "embedding": embed_result,
            "insights": insights,
        })

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


@router.get("/{policy_id}")
async def get_user_policy(policy_id: str, user: dict = Depends(get_current_user)):
    """Get a single policy with its latest insights."""
    policy = get_policy(policy_id, user["user_id"])
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    insights = get_insights(policy_id)
    return {"policy": policy, "insights": insights}


@router.put("/{policy_id}")
async def update_user_policy(
    policy_id: str, body: PolicyUpdateBody,
    user: dict = Depends(get_current_user),
):
    """Update policy content — creates a new version."""
    user_id = user["user_id"]
    policy = get_policy(policy_id, user_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    # Increment version
    updated = increment_version(policy_id, user_id)
    new_version = updated["current_version"]

    # Save version snapshot
    create_version(
        policy_id=policy_id, version=new_version, content=body.content,
        uploaded_by=user_id, summary=body.summary or f"Updated to v{new_version}",
    )

    # Re-embed with new content
    embed_result = embed_policy(
        policy_id=policy_id, user_id=user_id,
        text_content=body.content, category=policy["category"],
        version=new_version,
    )

    # Re-analyze
    insights = analyze_policy(policy_id=policy_id, text_content=body.content, version=new_version)

    return {
        "success": True, "policy": updated,
        "embedding": embed_result, "insights": insights,
    }


@router.put("/{policy_id}/metadata")
async def update_policy_meta(
    policy_id: str, body: PolicyMetadataBody,
    user: dict = Depends(get_current_user),
):
    """Update policy name/category without creating a new version."""
    result = update_policy_metadata(policy_id, user["user_id"], name=body.name, category=body.category)
    if not result:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {"success": True, "policy": result}


@router.post("/{policy_id}/archive")
async def archive_user_policy(policy_id: str, user: dict = Depends(get_current_user)):
    """Archive a policy."""
    result = archive_policy(policy_id, user["user_id"])
    if not result:
        raise HTTPException(status_code=404, detail="Policy not found or already archived")
    return {"success": True, "policy": result}


@router.post("/{policy_id}/restore")
async def restore_user_policy(policy_id: str, user: dict = Depends(get_current_user)):
    """Restore an archived policy."""
    result = restore_policy(policy_id, user["user_id"])
    if not result:
        raise HTTPException(status_code=404, detail="Policy not found or not archived")
    return {"success": True, "policy": result}


@router.delete("/{policy_id}")
async def delete_user_policy(policy_id: str, user: dict = Depends(get_current_user)):
    """Delete a policy (soft delete + remove embeddings)."""
    user_id = user["user_id"]
    success = delete_policy(policy_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Policy not found")

    # Clean up embeddings and insights
    delete_policy_embeddings(policy_id, user_id)
    delete_insights(policy_id)

    return {"success": True, "policy_id": policy_id}


# ---------------------------------------------------------------------------
# Versions
# ---------------------------------------------------------------------------

@router.get("/{policy_id}/versions")
async def get_policy_versions(policy_id: str, user: dict = Depends(get_current_user)):
    """List all versions of a policy."""
    policy = get_policy(policy_id, user["user_id"])
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    versions = list_versions(policy_id)
    return {"versions": versions, "total": len(versions)}


@router.get("/{policy_id}/versions/{version}")
async def get_policy_version(
    policy_id: str, version: int,
    user: dict = Depends(get_current_user),
):
    """Get a specific version with content."""
    policy = get_policy(policy_id, user["user_id"])
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    ver = get_version(policy_id, version)
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")
    return ver


@router.get("/{policy_id}/versions/compare/{v1}/{v2}")
async def compare_policy_versions(
    policy_id: str, v1: int, v2: int,
    user: dict = Depends(get_current_user),
):
    """Compare two versions of a policy."""
    policy = get_policy(policy_id, user["user_id"])
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return compare_versions(policy_id, v1, v2)


@router.post("/{policy_id}/versions/{version}/rollback")
async def rollback_policy_version(
    policy_id: str, version: int,
    user: dict = Depends(get_current_user),
):
    """Rollback to a specific version — triggers full re-embedding."""
    user_id = user["user_id"]
    policy = get_policy(policy_id, user_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    rolled_back = rollback_to_version(policy_id, version)
    if not rolled_back:
        raise HTTPException(status_code=404, detail="Version not found")

    # Update policy record to match rolled-back version
    set_version(policy_id, user_id, version)

    # Full re-embedding with the rolled-back content
    embed_result = embed_policy(
        policy_id=policy_id, user_id=user_id,
        text_content=rolled_back["content"],
        category=policy["category"], version=version,
    )

    # Re-analyze
    insights = analyze_policy(
        policy_id=policy_id, text_content=rolled_back["content"], version=version,
    )

    return {
        "success": True, "message": f"Rolled back to version {version}",
        "version": rolled_back, "embedding": embed_result, "insights": insights,
    }


# ---------------------------------------------------------------------------
# AI Insights
# ---------------------------------------------------------------------------

@router.get("/{policy_id}/insights")
async def get_policy_insights(policy_id: str, user: dict = Depends(get_current_user)):
    """Get AI analysis for a policy."""
    policy = get_policy(policy_id, user["user_id"])
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    insights = get_insights(policy_id)
    if not insights:
        raise HTTPException(status_code=404, detail="No insights available")
    return insights


@router.post("/{policy_id}/reanalyze")
async def reanalyze_policy(policy_id: str, user: dict = Depends(get_current_user)):
    """Re-run AI analysis for a policy."""
    policy = get_policy(policy_id, user["user_id"])
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    active = get_active_version(policy_id)
    if not active:
        raise HTTPException(status_code=404, detail="No active version found")

    insights = analyze_policy(
        policy_id=policy_id, text_content=active["content"],
        version=policy["current_version"],
    )
    return {"success": True, "insights": insights}


@router.post("/{policy_id}/re-embed")
async def re_embed_user_policy(policy_id: str, user: dict = Depends(get_current_user)):
    """Re-generate embeddings for a policy."""
    user_id = user["user_id"]
    policy = get_policy(policy_id, user_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    active = get_active_version(policy_id)
    if not active:
        raise HTTPException(status_code=404, detail="No active version found")

    result = embed_policy(
        policy_id=policy_id, user_id=user_id,
        text_content=active["content"], category=policy["category"],
        version=policy["current_version"],
    )
    return {"success": True, "embedding": result}


# ---------------------------------------------------------------------------
# Missing Policies & Retrieval Testing
# ---------------------------------------------------------------------------

@router.get("/suggestions/missing")
async def get_missing_policies(user: dict = Depends(get_current_user)):
    """Suggest missing standard policies."""
    dashboard = get_policy_dashboard(user["user_id"])
    existing = dashboard.get("categories", [])
    suggestions = suggest_missing_policies(user["user_id"], existing)
    return {"suggestions": suggestions, "total": len(suggestions)}


@router.post("/test/retrieval")
async def test_policy_retrieval(
    body: TestRetrievalBody,
    user: dict = Depends(get_current_user),
):
    """Test retrieval: query Milvus and see which policy chunks are returned."""
    results = retrieve_policy_documents(user["user_id"], body.query, top_k=body.top_k)
    return {"results": results, "total": len(results), "query": body.query}


@router.get("/system/embedding-status")
async def embedding_system_status(user: dict = Depends(get_current_user)):
    """Check embedding system health."""
    return get_embedding_status()
