"""
policy_version_manager.py — Version Tracking & Rollback
=========================================================
Full version history, comparison, and rollback for policies.
Each update creates a new version record in MongoDB.
Rollback triggers re-embedding in Milvus.
"""

import difflib
from datetime import datetime, timezone
from typing import Dict, List, Optional

from mongo_auth_db import get_auth_db


def _versions_col():
    return get_auth_db()["policy_versions"]


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


# Ensure indexes
try:
    col = _versions_col()
    col.create_index([("policy_id", 1), ("version", 1)], unique=True)
    col.create_index([("policy_id", 1)])
except Exception:
    pass


def create_version(
    policy_id: str, version: int, content: str,
    uploaded_by: str, summary: str = "",
) -> Dict:
    """Save a new version snapshot."""
    # Deactivate previous versions
    _versions_col().update_many(
        {"policy_id": policy_id},
        {"$set": {"is_active": False}},
    )

    doc = {
        "policy_id": policy_id, "version": version,
        "content": content, "summary": summary or f"Version {version}",
        "uploaded_by": uploaded_by, "created_at": _now(), "is_active": True,
    }
    _versions_col().insert_one(doc)
    print(f"[VERSION] Created v{version} for policy '{policy_id}'")
    return _to_public(doc)


def list_versions(policy_id: str) -> List[Dict]:
    """List all versions for a policy (newest first)."""
    docs = _versions_col().find({"policy_id": policy_id}).sort("version", -1)
    return [_to_public(doc) for doc in docs]


def get_version(policy_id: str, version: int) -> Optional[Dict]:
    """Get a specific version."""
    doc = _versions_col().find_one({"policy_id": policy_id, "version": version})
    return _to_public_with_content(doc) if doc else None


def get_active_version(policy_id: str) -> Optional[Dict]:
    """Get the currently active version."""
    doc = _versions_col().find_one({"policy_id": policy_id, "is_active": True})
    return _to_public_with_content(doc) if doc else None


def get_version_content(policy_id: str, version: int) -> Optional[str]:
    """Get raw content for a specific version."""
    doc = _versions_col().find_one(
        {"policy_id": policy_id, "version": version},
        {"content": 1},
    )
    return doc.get("content") if doc else None


def compare_versions(policy_id: str, v1: int, v2: int) -> Dict:
    """Compare two versions and return a text diff."""
    content1 = get_version_content(policy_id, v1) or ""
    content2 = get_version_content(policy_id, v2) or ""

    diff_lines = list(difflib.unified_diff(
        content1.splitlines(keepends=True),
        content2.splitlines(keepends=True),
        fromfile=f"Version {v1}", tofile=f"Version {v2}",
        lineterm="",
    ))

    additions = sum(1 for line in diff_lines if line.startswith("+") and not line.startswith("+++"))
    deletions = sum(1 for line in diff_lines if line.startswith("-") and not line.startswith("---"))

    return {
        "policy_id": policy_id,
        "from_version": v1, "to_version": v2,
        "diff": "\n".join(diff_lines),
        "additions": additions, "deletions": deletions,
        "has_changes": len(diff_lines) > 0,
    }


def rollback_to_version(policy_id: str, version: int) -> Optional[Dict]:
    """
    Set a specific version as active. Returns the version doc.
    Caller is responsible for triggering re-embedding.
    """
    target = _versions_col().find_one({"policy_id": policy_id, "version": version})
    if not target:
        return None

    # Deactivate all versions
    _versions_col().update_many(
        {"policy_id": policy_id},
        {"$set": {"is_active": False}},
    )

    # Activate the target version
    _versions_col().update_one(
        {"policy_id": policy_id, "version": version},
        {"$set": {"is_active": True}},
    )

    print(f"[VERSION] Rolled back policy '{policy_id}' to v{version}")
    return _to_public_with_content(target)


def delete_all_versions(policy_id: str) -> int:
    """Delete all version records for a policy."""
    result = _versions_col().delete_many({"policy_id": policy_id})
    return result.deleted_count


def _to_public(doc):
    if not doc:
        return None
    return {
        "policy_id": doc.get("policy_id"),
        "version": doc.get("version"),
        "summary": doc.get("summary", ""),
        "uploaded_by": doc.get("uploaded_by", ""),
        "created_at": _iso(doc.get("created_at")),
        "is_active": doc.get("is_active", False),
    }


def _to_public_with_content(doc):
    if not doc:
        return None
    result = _to_public(doc)
    result["content"] = doc.get("content", "")
    return result
