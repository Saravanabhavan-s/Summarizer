"""
auth.py — JWT Authentication & Role-Based Access Control
=========================================================
Authentication storage is backed by MongoDB only.
"""

import os
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import List, Optional

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from mongo_auth_db import ensure_indexes, get_tokens_collection, get_users_collection


JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
JWT_ALGORITHM = "HS256"
VALID_ROLES = {"admin", "evaluator", "user"}


@dataclass
class User:
    user_id: str
    username: str
    password_hash: str
    role: str
    created_at: str
    blocked: bool = False
    last_login: Optional[str] = None
    last_activity: Optional[str] = None
    display_name: Optional[str] = None
    organization: Optional[str] = None
    avatar_url: Optional[str] = None
    totp_enabled: bool = False
    totp_secret: Optional[str] = None
    google_id: Optional[str] = None


def _utcnow() -> datetime:
    return datetime.utcnow()


def _iso_now() -> str:
    return _utcnow().isoformat()


def _doc_to_user(doc: Optional[dict]) -> Optional[User]:
    if not doc:
        return None
    return User(
        user_id=str(doc.get("user_id", "")),
        username=str(doc.get("username", "")),
        password_hash=str(doc.get("password_hash", "")),
        role=str(doc.get("role", "user")),
        created_at=str(doc.get("created_at", "")),
        blocked=bool(doc.get("blocked", False)),
        last_login=doc.get("last_login"),
        last_activity=doc.get("last_activity"),
        display_name=doc.get("display_name"),
        organization=doc.get("organization"),
        avatar_url=doc.get("avatar_url"),
        totp_enabled=bool(doc.get("totp_enabled", False)),
        totp_secret=doc.get("totp_secret"),
        google_id=doc.get("google_id"),
    )


def _user_public_dict(user: User) -> dict:
    return {
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "blocked": user.blocked,
        "created_at": user.created_at,
        "last_login": user.last_login,
        "last_activity": user.last_activity,
        "display_name": user.display_name,
        "organization": user.organization,
        "avatar_url": user.avatar_url,
        "totp_enabled": user.totp_enabled,
        "google_id": user.google_id,
    }


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, role: str) -> str:
    expiry_dt = _utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    issued_dt = _utcnow()
    jti = str(uuid.uuid4())

    payload = {
        "jti": jti,
        "user_id": user_id,
        "role": role,
        "iat": issued_dt,
        "exp": expiry_dt,
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

    # Persist JWT metadata in MongoDB for revocation/session control.
    get_tokens_collection().insert_one(
        {
            "jti": jti,
            "user_id": user_id,
            "token_type": "access",
            "issued_at": issued_dt,
            "expires_at": expiry_dt,
            "revoked": False,
        }
    )
    return token


def verify_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    jti = payload.get("jti")
    if jti:
        token_doc = get_tokens_collection().find_one({"jti": jti}, {"revoked": 1})
        if token_doc and token_doc.get("revoked"):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    user = get_user(str(payload.get("user_id", "")))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if user.blocked:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is blocked")

    return payload


def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    try:
        scheme, token = authorization.split(" ")
        if scheme.lower() != "bearer":
            raise ValueError("Invalid scheme")
    except (ValueError, IndexError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
        ) from exc

    return verify_token(token)


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def _get_user_by_username(username: str) -> Optional[User]:
    doc = get_users_collection().find_one({"username": username})
    return _doc_to_user(doc)


def get_user(user_id: str) -> Optional[User]:
    doc = get_users_collection().find_one({"user_id": user_id})
    return _doc_to_user(doc)


def register_user(username: str, password: str) -> dict:
    username = (username or "").strip()
    if not username or len(username) < 3:
        return {"success": False, "message": "Username must be at least 3 characters"}
    if not password or len(password) < 6:
        return {"success": False, "message": "Password must be at least 6 characters"}

    now_iso = _iso_now()
    user_doc = {
        "user_id": username,
        "username": username,
        "password_hash": hash_password(password),
        "role": "user",
        "created_at": now_iso,
        "blocked": False,
        "last_login": None,
        "last_activity": None,
    }

    try:
        get_users_collection().insert_one(user_doc)
    except DuplicateKeyError:
        return {"success": False, "message": f"Username '{username}' already exists"}
    except PyMongoError as exc:
        return {"success": False, "message": f"Database error: {exc}"}

    user = _doc_to_user(user_doc)
    print(f"[AUTH] User registered: {username} (role=user)")
    return {
        "success": True,
        "message": f"User '{username}' registered successfully",
        "user": asdict(user),
    }


def login_user(username: str, password: str) -> dict:
    user = _get_user_by_username((username or "").strip())
    if not user:
        return {"success": False, "message": "Invalid username or password", "token": None}
    if user.blocked:
        return {"success": False, "message": "Your account is blocked. Contact admin.", "token": None}
    if not verify_password(password, user.password_hash):
        return {"success": False, "message": "Invalid username or password", "token": None}

    token = create_token(user.user_id, user.role)
    now_iso = _iso_now()
    get_users_collection().update_one(
        {"user_id": user.user_id},
        {"$set": {"last_login": now_iso, "last_activity": now_iso}},
    )
    print(f"[AUTH] User logged in: {user.username} (role={user.role})")

    return {
        "success": True,
        "message": f"Welcome, {user.username}!",
        "token": token,
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "display_name": user.display_name,
        "organization": user.organization,
        "avatar_url": user.avatar_url,
        "totp_enabled": user.totp_enabled,
        "created_at": user.created_at,
        "last_login": user.last_login,
    }


def create_admin_user(username: str = "admin", password: str = "admin123") -> dict:
    username = (username or "").strip()
    if _get_user_by_username(username):
        return {"success": False, "message": f"User '{username}' already exists"}

    now_iso = _iso_now()
    admin_doc = {
        "user_id": username,
        "username": username,
        "password_hash": hash_password(password),
        "role": "admin",
        "created_at": now_iso,
        "blocked": False,
        "last_login": None,
        "last_activity": None,
    }

    try:
        get_users_collection().insert_one(admin_doc)
    except DuplicateKeyError:
        return {"success": False, "message": f"User '{username}' already exists"}
    except PyMongoError as exc:
        return {"success": False, "message": f"Database error: {exc}"}

    print(f"[AUTH] Admin user created: {username}")
    return {
        "success": True,
        "message": f"Admin user '{username}' created. Use for monitoring dashboard.",
    }


def list_users() -> List[dict]:
    rows = get_users_collection().find(
        {},
        {
            "_id": 0,
            "user_id": 1,
            "username": 1,
            "role": 1,
            "blocked": 1,
            "created_at": 1,
            "last_login": 1,
            "last_activity": 1,
        },
    )
    return list(rows.sort("created_at", -1))


def add_user_by_admin(username: str, password: str, role: str = "user") -> dict:
    normalized_role = (role or "user").strip().lower()
    if normalized_role not in VALID_ROLES:
        return {"success": False, "message": f"Invalid role '{role}'. Allowed: {sorted(VALID_ROLES)}"}

    result = register_user(username=username, password=password)
    if not result.get("success"):
        return result

    get_users_collection().update_one(
        {"user_id": username},
        {"$set": {"role": normalized_role, "last_activity": _iso_now()}},
    )
    user = get_user(username)
    return {
        "success": True,
        "message": f"User '{username}' created with role '{normalized_role}'",
        "user": _user_public_dict(user),
    }


def delete_user(user_id: str, actor_user_id: Optional[str] = None) -> dict:
    if actor_user_id and user_id == actor_user_id:
        return {"success": False, "message": "Admin cannot delete their own account"}

    result = get_users_collection().delete_one({"user_id": user_id})
    if result.deleted_count == 0:
        return {"success": False, "message": "User not found"}

    get_tokens_collection().update_many({"user_id": user_id}, {"$set": {"revoked": True}})
    return {"success": True, "message": f"User '{user_id}' deleted"}


def block_user(user_id: str) -> dict:
    result = get_users_collection().find_one_and_update(
        {"user_id": user_id},
        {"$set": {"blocked": True, "last_activity": _iso_now()}},
        return_document=ReturnDocument.AFTER,
    )
    user = _doc_to_user(result)
    if not user:
        return {"success": False, "message": "User not found"}

    get_tokens_collection().update_many({"user_id": user_id}, {"$set": {"revoked": True}})
    return {"success": True, "message": f"User '{user_id}' blocked", "user": _user_public_dict(user)}


def unblock_user(user_id: str) -> dict:
    result = get_users_collection().find_one_and_update(
        {"user_id": user_id},
        {"$set": {"blocked": False, "last_activity": _iso_now()}},
        return_document=ReturnDocument.AFTER,
    )
    user = _doc_to_user(result)
    if not user:
        return {"success": False, "message": "User not found"}

    return {"success": True, "message": f"User '{user_id}' unblocked", "user": _user_public_dict(user)}


def assign_role(user_id: str, role: str) -> dict:
    normalized_role = (role or "").strip().lower()
    if normalized_role not in VALID_ROLES:
        return {"success": False, "message": f"Invalid role '{role}'. Allowed: {sorted(VALID_ROLES)}"}

    result = get_users_collection().find_one_and_update(
        {"user_id": user_id},
        {"$set": {"role": normalized_role, "last_activity": _iso_now()}},
        return_document=ReturnDocument.AFTER,
    )
    user = _doc_to_user(result)
    if not user:
        return {"success": False, "message": "User not found"}

    return {
        "success": True,
        "message": f"Role updated for '{user_id}' to '{normalized_role}'",
        "user": _user_public_dict(user),
    }


def record_user_activity(user_id: str) -> None:
    get_users_collection().update_one({"user_id": user_id}, {"$set": {"last_activity": _iso_now()}})


def get_user_activity(user_id: str) -> dict:
    user = get_user(user_id)
    if not user:
        return {"success": False, "message": "User not found"}

    return {
        "success": True,
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "blocked": user.blocked,
        "created_at": user.created_at,
        "last_login": user.last_login,
        "last_activity": user.last_activity,
    }


class MongoUsersProxy:
    """Dict-like compatibility wrapper used by existing main.py imports."""

    def __contains__(self, user_id: str) -> bool:
        return get_user(user_id) is not None

    def get(self, user_id: str, default=None):
        user = get_user(user_id)
        return user if user is not None else default

    def __getitem__(self, user_id: str) -> User:
        user = get_user(user_id)
        if user is None:
            raise KeyError(user_id)
        return user


ensure_indexes()
USERS_DB = MongoUsersProxy()
