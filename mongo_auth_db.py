"""
mongo_auth_db.py
================
MongoDB connection and collection helpers for authentication data.
"""

import os
from functools import lru_cache

from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import OperationFailure


load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "summarizer_auth")


@lru_cache(maxsize=1)
def get_mongo_client() -> MongoClient:
    """Create and cache a singleton MongoDB client."""
    if "<db_password>" in MONGODB_URI:
        raise RuntimeError(
            "MONGODB_URI contains the '<db_password>' placeholder. "
            "Set a real password in .env (URL-encode special characters)."
        )
    return MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)


def get_auth_db() -> Database:
    """Return the auth database handle."""
    return get_mongo_client()[MONGODB_DB_NAME]


def get_users_collection() -> Collection:
    """Return users collection used by auth.py."""
    return get_auth_db()["users"]


def get_tokens_collection() -> Collection:
    """Return token metadata collection (for revocation/session tracking)."""
    return get_auth_db()["auth_tokens"]


def ensure_indexes() -> None:
    """Ensure required indexes exist for auth collections."""
    try:
        users = get_users_collection()
        users.create_index([("user_id", ASCENDING)], unique=True)
        users.create_index([("username", ASCENDING)], unique=True)

        tokens = get_tokens_collection()
        tokens.create_index([("jti", ASCENDING)], unique=True)
        tokens.create_index([("user_id", ASCENDING)])
        tokens.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
    except OperationFailure as exc:
        raise RuntimeError(
            "MongoDB authentication failed. Verify MONGODB_URI credentials and IP allowlist."
        ) from exc
