"""
policy_summary_engine.py — AI Policy Analysis
===============================================
Uses the existing OpenRouter LLM to generate structured insights
from policy text: summary, required/forbidden behaviors, escalation
conditions, risk triggers, and missing policy suggestions.

Results are cached in MongoDB ``policy_insights`` collection.
"""

import json
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional

from openai import OpenAI
from mongo_auth_db import get_auth_db

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")


def _insights_col():
    return get_auth_db()["policy_insights"]


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
    col = _insights_col()
    col.create_index([("policy_id", 1), ("version", 1)], unique=True)
    col.create_index([("policy_id", 1)])
except Exception:
    pass


def analyze_policy(policy_id: str, text_content: str, version: int = 1) -> Dict:
    """
    Run AI analysis on policy text and store structured insights.
    Uses OpenRouter LLM (same key as call scoring).
    Returns the insights dict.
    """
    if not OPENROUTER_API_KEY or OPENROUTER_API_KEY == "[OPENROUTER_API_KEY]":
        return _fallback_insights(policy_id, version, "API key not configured")

    client = OpenAI(api_key=OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")

    prompt = f"""Analyze this company policy document and return ONLY valid JSON.

POLICY TEXT:
{text_content[:4000]}

Return EXACTLY this JSON structure:
{{
  "summary": "Brief 2-3 sentence description of what this policy covers",
  "required_behaviors": ["behavior 1", "behavior 2"],
  "forbidden_behaviors": ["behavior 1", "behavior 2"],
  "escalation_conditions": ["condition 1", "condition 2"],
  "required_phrases": ["phrase 1", "phrase 2"],
  "restricted_phrases": ["phrase 1", "phrase 2"],
  "risk_triggers": ["trigger 1", "trigger 2"],
  "missing_policy_suggestions": ["suggestion 1", "suggestion 2"]
}}

RULES:
- Be thorough and specific
- Extract actual behaviors from the policy text
- For missing_policy_suggestions, identify gaps this policy doesn't cover
- Return ONLY raw JSON, no markdown, no explanation
"""

    try:
        response = client.chat.completions.create(
            model=OPENROUTER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2, max_tokens=800,
        )
        content = response.choices[0].message.content.strip()

        # Strip markdown fences if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        result = json.loads(content)

        # Validate required keys
        required_keys = [
            "summary", "required_behaviors", "forbidden_behaviors",
            "escalation_conditions", "required_phrases", "restricted_phrases",
            "risk_triggers", "missing_policy_suggestions",
        ]
        for key in required_keys:
            if key not in result:
                result[key] = [] if key != "summary" else "Analysis incomplete"

        # Ensure all list fields are actually lists
        for key in required_keys:
            if key != "summary" and not isinstance(result[key], list):
                result[key] = [str(result[key])]

    except Exception as exc:
        print(f"[POLICY_AI][WARN] Analysis failed: {exc}")
        return _fallback_insights(policy_id, version, str(exc))

    # Store in MongoDB (upsert)
    insights_doc = {
        "policy_id": policy_id,
        "version": version,
        **result,
        "analyzed_at": _now(),
    }

    _insights_col().update_one(
        {"policy_id": policy_id, "version": version},
        {"$set": insights_doc},
        upsert=True,
    )

    print(f"[POLICY_AI] Analyzed policy '{policy_id}' v{version}")
    return _to_public(insights_doc)


def get_insights(policy_id: str, version: Optional[int] = None) -> Optional[Dict]:
    """Retrieve cached insights for a policy. Latest version if not specified."""
    query = {"policy_id": policy_id}
    if version is not None:
        query["version"] = version

    doc = _insights_col().find_one(query, sort=[("version", -1)])
    return _to_public(doc) if doc else None


def delete_insights(policy_id: str) -> int:
    """Delete all insights for a policy."""
    result = _insights_col().delete_many({"policy_id": policy_id})
    return result.deleted_count


def suggest_missing_policies(user_id: str, existing_categories: List[str]) -> List[Dict]:
    """Suggest missing standard policies based on what's already uploaded."""
    from services.policy_service import STANDARD_POLICIES
    missing = []
    for sp in STANDARD_POLICIES:
        if sp["category"] not in existing_categories:
            missing.append({
                "category": sp["category"],
                "name": sp["name"],
                "reason": f"No {sp['name'].lower()} found. This is recommended for compliance.",
            })
    return missing


def _fallback_insights(policy_id, version, reason):
    doc = {
        "policy_id": policy_id, "version": version,
        "summary": "AI analysis unavailable. Policy uploaded successfully.",
        "required_behaviors": [], "forbidden_behaviors": [],
        "escalation_conditions": [], "required_phrases": [],
        "restricted_phrases": [], "risk_triggers": [],
        "missing_policy_suggestions": [],
        "analyzed_at": _now(), "_fallback": True, "_reason": reason,
    }
    _insights_col().update_one(
        {"policy_id": policy_id, "version": version},
        {"$set": doc}, upsert=True,
    )
    return _to_public(doc)


def _to_public(doc):
    if not doc:
        return None
    return {
        "policy_id": doc.get("policy_id"),
        "version": doc.get("version"),
        "summary": doc.get("summary", ""),
        "required_behaviors": doc.get("required_behaviors", []),
        "forbidden_behaviors": doc.get("forbidden_behaviors", []),
        "escalation_conditions": doc.get("escalation_conditions", []),
        "required_phrases": doc.get("required_phrases", []),
        "restricted_phrases": doc.get("restricted_phrases", []),
        "risk_triggers": doc.get("risk_triggers", []),
        "missing_policy_suggestions": doc.get("missing_policy_suggestions", []),
        "analyzed_at": _iso(doc.get("analyzed_at")),
    }
