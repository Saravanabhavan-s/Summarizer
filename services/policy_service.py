"""
policy_service.py — Policy CRUD Operations
============================================
MongoDB-backed CRUD for user policies with category management,
status tracking, and dashboard statistics.
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from mongo_auth_db import get_auth_db

POLICY_CATEGORIES = [
    "refund", "escalation", "compliance", "privacy",
    "sales", "objection_handling", "custom",
]

STANDARD_POLICIES = [
    {"category": "refund", "name": "Refund Policy"},
    {"category": "escalation", "name": "Escalation Policy"},
    {"category": "compliance", "name": "Compliance Policy"},
    {"category": "privacy", "name": "Privacy Policy"},
    {"category": "sales", "name": "Sales Policy"},
]

POLICY_STATUSES = ["active", "archived", "deleted"]


def _policies_col():
    return get_auth_db()["policies"]


def _now():
    return datetime.now(timezone.utc)


def _ensure_indexes():
    col = _policies_col()
    col.create_index([("user_id", 1)])
    col.create_index([("user_id", 1), ("status", 1)])
    col.create_index([("user_id", 1), ("category", 1)])
    col.create_index([("policy_id", 1)], unique=True)


try:
    _ensure_indexes()
except Exception as exc:
    print(f"[POLICY_SERVICE][WARN] Index creation skipped: {exc}")


def _iso(dt):
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


def _to_public(doc):
    if not doc:
        return None
    return {
        "policy_id": doc.get("policy_id"),
        "user_id": doc.get("user_id"),
        "organization_id": doc.get("organization_id", ""),
        "name": doc.get("name"),
        "category": doc.get("category"),
        "status": doc.get("status"),
        "current_version": doc.get("current_version", 1),
        "file_name": doc.get("file_name", ""),
        "created_at": _iso(doc.get("created_at")),
        "updated_at": _iso(doc.get("updated_at")),
        "last_used_in_evaluation": _iso(doc.get("last_used_in_evaluation")),
        "evaluation_count": doc.get("evaluation_count", 0),
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def create_policy(user_id, name, category, content, file_name="", organization_id=""):
    if category not in POLICY_CATEGORIES:
        category = "custom"
    policy_id = str(uuid.uuid4())
    now = _now()
    doc = {
        "policy_id": policy_id, "user_id": user_id,
        "organization_id": organization_id, "name": name.strip(),
        "category": category, "status": "active", "current_version": 1,
        "file_name": file_name, "created_at": now, "updated_at": now,
        "last_used_in_evaluation": None, "evaluation_count": 0,
    }
    _policies_col().insert_one(doc)
    print(f"[POLICY_SERVICE] Created policy '{name}' ({policy_id})")
    return _to_public(doc)


def get_policies(user_id, category=None, status=None):
    query = {"user_id": user_id}
    if status:
        query["status"] = status
    else:
        query["status"] = {"$ne": "deleted"}
    if category and category in POLICY_CATEGORIES:
        query["category"] = category
    docs = _policies_col().find(query).sort("updated_at", -1)
    return [_to_public(doc) for doc in docs]


def get_policy(policy_id, user_id):
    doc = _policies_col().find_one(
        {"policy_id": policy_id, "user_id": user_id, "status": {"$ne": "deleted"}}
    )
    return _to_public(doc) if doc else None


def update_policy_metadata(policy_id, user_id, name=None, category=None):
    update_fields = {"updated_at": _now()}
    if name is not None:
        update_fields["name"] = name.strip()
    if category is not None and category in POLICY_CATEGORIES:
        update_fields["category"] = category
    result = _policies_col().find_one_and_update(
        {"policy_id": policy_id, "user_id": user_id, "status": {"$ne": "deleted"}},
        {"$set": update_fields}, return_document=True,
    )
    return _to_public(result) if result else None


def increment_version(policy_id, user_id):
    result = _policies_col().find_one_and_update(
        {"policy_id": policy_id, "user_id": user_id, "status": {"$ne": "deleted"}},
        {"$inc": {"current_version": 1}, "$set": {"updated_at": _now()}},
        return_document=True,
    )
    return _to_public(result) if result else None


def set_version(policy_id, user_id, version):
    result = _policies_col().find_one_and_update(
        {"policy_id": policy_id, "user_id": user_id},
        {"$set": {"current_version": version, "updated_at": _now()}},
        return_document=True,
    )
    return _to_public(result) if result else None


def archive_policy(policy_id, user_id):
    result = _policies_col().find_one_and_update(
        {"policy_id": policy_id, "user_id": user_id, "status": "active"},
        {"$set": {"status": "archived", "updated_at": _now()}},
        return_document=True,
    )
    return _to_public(result) if result else None


def restore_policy(policy_id, user_id):
    result = _policies_col().find_one_and_update(
        {"policy_id": policy_id, "user_id": user_id, "status": "archived"},
        {"$set": {"status": "active", "updated_at": _now()}},
        return_document=True,
    )
    return _to_public(result) if result else None


def delete_policy(policy_id, user_id):
    result = _policies_col().update_one(
        {"policy_id": policy_id, "user_id": user_id},
        {"$set": {"status": "deleted", "updated_at": _now()}},
    )
    return result.modified_count > 0


def record_evaluation_usage(policy_id, user_id):
    _policies_col().update_one(
        {"policy_id": policy_id, "user_id": user_id},
        {"$set": {"last_used_in_evaluation": _now()}, "$inc": {"evaluation_count": 1}},
    )


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

def get_policy_dashboard(user_id):
    col = _policies_col()
    all_policies = list(col.find({"user_id": user_id, "status": {"$ne": "deleted"}}))
    active = [p for p in all_policies if p.get("status") == "active"]
    archived = [p for p in all_policies if p.get("status") == "archived"]

    latest = None
    if all_policies:
        sorted_p = sorted(all_policies, key=lambda p: p.get("updated_at") or p.get("created_at"), reverse=True)
        latest = _to_public(sorted_p[0])

    existing_cats = {p.get("category") for p in active}
    missing = [sp for sp in STANDARD_POLICIES if sp["category"] not in existing_cats]
    std_count = len(STANDARD_POLICIES)
    covered = sum(1 for sp in STANDARD_POLICIES if sp["category"] in existing_cats)
    compliance_score = round((covered / std_count) * 100) if std_count else 0
    total_evals = sum(p.get("evaluation_count", 0) for p in active)

    if compliance_score >= 80:
        health = "healthy"
    elif compliance_score >= 50:
        health = "moderate"
    else:
        health = "critical"

    return {
        "total_active": len(active), "total_archived": len(archived),
        "total_policies": len(all_policies), "compliance_score": compliance_score,
        "health_status": health, "latest_updated": latest,
        "missing_policies": missing, "total_evaluations": total_evals,
        "categories": list(existing_cats),
    }
