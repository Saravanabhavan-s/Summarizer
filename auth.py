"""
auth.py — JWT Authentication & Role-Based Access Control
==========================================================
Handles user authentication, token generation/verification, and role enforcement.
Integrates with FastAPI via decorators and middleware.

This module provides:
- User model and storage
- Password hashing (bcrypt)
- JWT token creation and verification
- Auth decorators for route protection
- Admin-only access enforcement
"""

import os
import jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Optional, Dict, List
from functools import wraps
from dataclasses import dataclass, asdict
from fastapi import Depends, HTTPException, status, Header

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
JWT_ALGORITHM = "HS256"

# In production, use a proper database (PostgreSQL, MongoDB, etc.)
# For demo, we use in-memory storage
USERS_DB: Dict[str, 'User'] = {}
VALID_ROLES = {"admin", "evaluator", "user"}


# ---------------------------------------------------------------------------
# User Model
# ---------------------------------------------------------------------------

@dataclass
class User:
    """
    User model for authentication.
    
    Attributes:
        user_id (str):        Unique user identifier (stored as username for demo)
        username (str):       Login username
        password_hash (str):  Bcrypt hashed password (never store plaintext)
        role (str):           "admin", "evaluator", or "user"
        created_at (str):     ISO 8601 timestamp when user was created
        blocked (bool):       True if user login is blocked by admin
        last_login (str):     Last successful login timestamp
        last_activity (str):  Last activity timestamp
    """
    user_id: str
    username: str
    password_hash: str
    role: str
    created_at: str
    blocked: bool = False
    last_login: Optional[str] = None
    last_activity: Optional[str] = None


# ---------------------------------------------------------------------------
# Step 1 — Password Management
# ---------------------------------------------------------------------------

# Function: hash_password
# Purpose:  Hash a plaintext password using bcrypt
# Input:    password (str) — plaintext password from user registration/change
# Output:   str — bcrypt hash (includes salt, safe to store in DB)
# Why needed:
#   Never store plaintext passwords. Bcrypt is slow by design to resist
#   brute-force attacks. The hash includes a random salt so identical
#   passwords produce different hashes.
def hash_password(password: str) -> str:
    """
    Hash a plaintext password using bcrypt.
    
    Args:
        password: Plaintext password string.
    
    Returns:
        Bcrypt hash string (safe to store in database).
    """
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


# Function: verify_password
# Purpose:  Check if a plaintext password matches a bcrypt hash
# Input:    password (str) — plaintext password from login attempt
#           password_hash (str) — stored bcrypt hash from DB
# Output:   bool — True if password matches, False otherwise
# Why needed:
#   During login, compare the user-submitted password against the stored
#   hash. Returns boolean, never leaks timing info about which part failed.
def verify_password(password: str, password_hash: str) -> bool:
    """
    Verify a plaintext password against a bcrypt hash.
    
    Args:
        password:       Plaintext password to check.
        password_hash:  Stored bcrypt hash.
    
    Returns:
        True if password matches, False otherwise.
    """
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Step 2 — JWT Token Management
# ---------------------------------------------------------------------------

# Function: create_token
# Purpose:  Generate a JWT token for an authenticated user
# Input:    user_id (str) — unique user identifier
#           role (str) — user role ("admin" or "user")
# Output:   str — signed JWT token containing user_id, role, and expiry
# Why needed:
#   After login, return a token that the client stores and sends with
#   every request. The token is stateless (no server session needed) and
#   includes the user's role, so we can authorize requests without a DB lookup.
def create_token(user_id: str, role: str) -> str:
    """
    Generate a JWT token for a user.
    
    Args:
        user_id: Unique user identifier.
        role:    User role ("admin" or "user").
    
    Returns:
        Signed JWT token string.
    """
    expiry = datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": expiry,
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token


# Function: verify_token
# Purpose:  Decode and validate a JWT token, returning the payload
# Input:    token (str) — the JWT token from the Authorization header
# Output:   dict — decoded payload (user_id, role, exp) OR None if invalid
# Why needed:
#   Every protected endpoint needs to verify the token before processing.
#   Checks signature, expiry, and returns the payload if valid. Returns
#   None/raises exception if tampered with or expired.
def verify_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT token.
    
    Args:
        token: JWT token string from Authorization header.
    
    Returns:
        Decoded payload dict (user_id, role, exp) if valid.
    
    Raises:
        HTTPException: If token is invalid, expired, or tampered.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


# ---------------------------------------------------------------------------
# Step 3 — FastAPI Dependency Injection
# ---------------------------------------------------------------------------

# Function: get_current_user
# Purpose:  Dependency that extracts and verifies the JWT from request headers
# Input:    authorization (str) — Authorization header value ("Bearer <token>")
# Output:   dict — decoded token payload (user_id, role, exp)
# Why needed:
#   FastAPI dependency injection. Used with Depends(get_current_user) to
#   automatically extract and verify the token on any protected route.
#   If token is missing or invalid, FastAPI returns 401 before the route handler runs.
def get_current_user(authorization: str = Header(None)) -> dict:
    """
    FastAPI dependency to extract and verify the current user from JWT.
    
    Usage:
        @app.get("/protected")
        async def protected_route(user: dict = Depends(get_current_user)):
            user_id = user["user_id"]
            role = user["role"]
    
    Args:
        authorization: Authorization header value (automatic from FastAPI).
    
    Returns:
        Decoded token payload (user_id, role, exp).
    
    Raises:
        HTTPException 401: If token is missing or invalid.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header"
        )
    
    # Extract token from "Bearer <token>" format
    try:
        scheme, token = authorization.split(" ")
        if scheme.lower() != "bearer":
            raise ValueError("Invalid scheme")
    except (ValueError, IndexError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format"
        )
    
    return verify_token(token)


# Function: require_admin
# Purpose:  Dependency that checks if current user has admin role
# Input:    user (dict) — output from get_current_user()
# Output:   dict — same user dict if role is "admin"
# Why needed:
#   Admin-only routes use Depends(require_admin) to ensure only admins
#   can access monitoring/logging/user management endpoints.
#   Non-admins receive 403 Forbidden.
def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """
    FastAPI dependency that enforces admin role.
    
    Usage:
        @app.get("/admin/stats")
        async def admin_stats(user: dict = Depends(require_admin)):
            # Only admins reach here
    
    Args:
        user: Token payload from get_current_user().
    
    Returns:
        Same user dict if role is "admin".
    
    Raises:
        HTTPException 403: If role is not "admin".
    """
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


# ---------------------------------------------------------------------------
# Step 4 — User Registration & Login
# ---------------------------------------------------------------------------

# Function: register_user
# Purpose:  Create a new user with hashed password and "user" role
# Input:    username (str) — desired login username
#           password (str) — plaintext password (will be hashed)
# Output:   dict — {"success": bool, "message": str, "user": User}
# Why needed:
#   New users sign up with this function. Username must be unique.
#   Password is hashed before storage. Returns "user" role by default
#   (admins must be created separately, e.g., via direct DB manipulation).
def register_user(username: str, password: str) -> dict:
    """
    Register a new user with default "user" role.
    
    Args:
        username: Unique login username.
        password: Plaintext password (will be hashed).
    
    Returns:
        {
            "success": bool,
            "message": str,
            "user": User record (if success)
        }
    """
    # Check if username already exists
    if username in USERS_DB:
        return {
            "success": False,
            "message": f"Username '{username}' already exists"
        }

    # Validate
    if not username or len(username) < 3:
        return {
            "success": False,
            "message": "Username must be at least 3 characters"
        }

    if not password or len(password) < 6:
        return {
            "success": False,
            "message": "Password must be at least 6 characters"
        }

    # Hash password and create user
    password_hash = hash_password(password)
    user = User(
        user_id=username,
        username=username,
        password_hash=password_hash,
        role="user",  # Default role
        created_at=datetime.utcnow().isoformat(),
        blocked=False,
        last_login=None,
        last_activity=None,
    )

    # Store in memory DB
    USERS_DB[username] = user
    print(f"[AUTH] User registered: {username} (role=user)")

    return {
        "success": True,
        "message": f"User '{username}' registered successfully",
        "user": asdict(user)
    }


# Function: login_user
# Purpose:  Authenticate user via username/password and return JWT token
# Input:    username (str) — login username
#           password (str) — plaintext password
# Output:   dict — {"success": bool, "token": str, "user_id": str, "role": str}
# Why needed:
#   Login endpoint calls this. Verifies username exists and password matches.
#   If valid, generates a JWT token (short-lived, contains role).
#   Client stores and sends token with every request.
def login_user(username: str, password: str) -> dict:
    """
    Authenticate a user and return a JWT token.
    
    Args:
        username: User's login username.
        password: User's plaintext password.
    
    Returns:
        {
            "success": bool,
            "token": str (JWT, if success),
            "user_id": str,
            "role": str,
            "message": str
        }
    """
    # Check if user exists
    if username not in USERS_DB:
        return {
            "success": False,
            "message": "Invalid username or password",
            "token": None
        }

    user = USERS_DB[username]

    if user.blocked:
        return {
            "success": False,
            "message": "Your account is blocked. Contact admin.",
            "token": None
        }

    # Verify password
    if not verify_password(password, user.password_hash):
        return {
            "success": False,
            "message": "Invalid username or password",
            "token": None
        }

    # Generate token
    token = create_token(user.user_id, user.role)
    now = datetime.utcnow().isoformat()
    user.last_login = now
    user.last_activity = now
    print(f"[AUTH] User logged in: {username} (role={user.role})")

    return {
        "success": True,
        "message": f"Welcome, {username}!",
        "token": token,
        "user_id": user.user_id,
        "role": user.role
    }


# ---------------------------------------------------------------------------
# Step 5 — Bootstrap Admin User (Development Only)
# ---------------------------------------------------------------------------

# Function: create_admin_user
# Purpose:  Create an admin account (for development/setup only)
# Input:    username (str) — admin username
#           password (str) — admin password
# Output:   dict — {"success": bool, "message": str}
# Why needed:
#   In production, admins are created via a secure setup process.
#   This function is called once to bootstrap the first admin account
#   during development/testing.
def create_admin_user(username: str = "admin", password: str = "admin123") -> dict:
    """
    Create an admin user (development/setup only).
    
    In production, only call this during initial setup. Use a secure password.
    
    Args:
        username: Admin username (default "admin").
        password: Admin password (default "admin123").
    
    Returns:
        {"success": bool, "message": str}
    """
    if username in USERS_DB:
        return {
            "success": False,
            "message": f"User '{username}' already exists"
        }

    password_hash = hash_password(password)
    admin = User(
        user_id=username,
        username=username,
        password_hash=password_hash,
        role="admin",
        created_at=datetime.utcnow().isoformat(),
        blocked=False,
        last_login=None,
        last_activity=None,
    )

    USERS_DB[username] = admin
    print(f"[AUTH] Admin user created: {username}")

    return {
        "success": True,
        "message": f"Admin user '{username}' created. Use for monitoring dashboard."
    }


def _user_public_dict(user: User) -> dict:
    """Return safe user metadata for API responses (never includes password hash)."""
    return {
        "user_id": user.user_id,
        "username": user.username,
        "role": user.role,
        "blocked": user.blocked,
        "created_at": user.created_at,
        "last_login": user.last_login,
        "last_activity": user.last_activity,
    }


def get_user(user_id: str) -> Optional[User]:
    """Get user by user_id."""
    return USERS_DB.get(user_id)


def list_users() -> List[dict]:
    """List all users with safe metadata."""
    users = [_user_public_dict(user) for user in USERS_DB.values()]
    return sorted(users, key=lambda u: u["created_at"], reverse=True)


def add_user_by_admin(username: str, password: str, role: str = "user") -> dict:
    """Create a user with an explicit role (admin-only operation)."""
    normalized_role = (role or "user").strip().lower()
    if normalized_role not in VALID_ROLES:
        return {
            "success": False,
            "message": f"Invalid role '{role}'. Allowed: {sorted(VALID_ROLES)}"
        }

    result = register_user(username=username, password=password)
    if not result.get("success"):
        return result

    user = USERS_DB.get(username)
    if user:
        user.role = normalized_role

    return {
        "success": True,
        "message": f"User '{username}' created with role '{normalized_role}'",
        "user": _user_public_dict(user),
    }


def delete_user(user_id: str, actor_user_id: Optional[str] = None) -> dict:
    """Delete a user by ID (prevents deleting self)."""
    if actor_user_id and user_id == actor_user_id:
        return {
            "success": False,
            "message": "Admin cannot delete their own account"
        }

    if user_id not in USERS_DB:
        return {
            "success": False,
            "message": "User not found"
        }

    del USERS_DB[user_id]
    return {
        "success": True,
        "message": f"User '{user_id}' deleted"
    }


def block_user(user_id: str) -> dict:
    """Block a user from logging in."""
    user = USERS_DB.get(user_id)
    if not user:
        return {
            "success": False,
            "message": "User not found"
        }

    user.blocked = True
    return {
        "success": True,
        "message": f"User '{user_id}' blocked",
        "user": _user_public_dict(user),
    }


def unblock_user(user_id: str) -> dict:
    """Unblock a previously blocked user."""
    user = USERS_DB.get(user_id)
    if not user:
        return {
            "success": False,
            "message": "User not found"
        }

    user.blocked = False
    return {
        "success": True,
        "message": f"User '{user_id}' unblocked",
        "user": _user_public_dict(user),
    }


def assign_role(user_id: str, role: str) -> dict:
    """Assign a new role to a user."""
    normalized_role = (role or "").strip().lower()
    if normalized_role not in VALID_ROLES:
        return {
            "success": False,
            "message": f"Invalid role '{role}'. Allowed: {sorted(VALID_ROLES)}"
        }

    user = USERS_DB.get(user_id)
    if not user:
        return {
            "success": False,
            "message": "User not found"
        }

    user.role = normalized_role
    user.last_activity = datetime.utcnow().isoformat()
    return {
        "success": True,
        "message": f"Role updated for '{user_id}' to '{normalized_role}'",
        "user": _user_public_dict(user),
    }


def record_user_activity(user_id: str) -> None:
    """Update the user's last_activity field if the user exists."""
    user = USERS_DB.get(user_id)
    if user:
        user.last_activity = datetime.utcnow().isoformat()


def get_user_activity(user_id: str) -> dict:
    """Return user-level activity metadata."""
    user = USERS_DB.get(user_id)
    if not user:
        return {
            "success": False,
            "message": "User not found"
        }

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
