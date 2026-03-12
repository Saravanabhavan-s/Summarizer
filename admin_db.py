"""
admin_db.py — Admin Monitoring & Statistics Tracking
====================================================
Tracks system usage, errors, and request metrics for the admin dashboard.

This module provides:
- Request/evaluation tracking
- Error and failure logging
- User activity monitoring
- System health metrics
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Dict
from collections import defaultdict

# In production, use a real database (PostgreSQL, MongoDB, etc.)
# For demo, we use in-memory storage


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class RequestLog:
    """
    Log entry for a single API request.
    
    Attributes:
        timestamp (str):      ISO 8601 timestamp when request was made
        user_id (str):        User who made the request
        endpoint (str):       API endpoint called (e.g., "/process-call")
        method (str):         HTTP method ("GET", "POST", etc.)
        status_code (int):    HTTP response status (200, 400, 500, etc.)
        duration_ms (float):  How long request took in milliseconds
        filename (str):       Name of uploaded file (if applicable)
        success (bool):       Whether request completed without error
    """
    timestamp: str
    user_id: str
    endpoint: str
    method: str
    status_code: int
    duration_ms: float
    filename: str = ""
    success: bool = True


@dataclass
class ErrorLog:
    """
    Log entry for errors and exceptions.
    
    Attributes:
        timestamp (str):  ISO 8601 timestamp when error occurred
        user_id (str):    User when error happened (if applicable)
        error_type (str): Exception class name
        message (str):    Error message
        endpoint (str):   API endpoint where error occurred
        details (str):    Full traceback or additional context
    """
    timestamp: str
    user_id: str
    error_type: str
    message: str
    endpoint: str
    details: str = ""


# ---------------------------------------------------------------------------
# Admin Database (In-Memory for Demo)
# ---------------------------------------------------------------------------

class AdminDB:
    """
    Singleton admin database for tracking system metrics.
    
    In production, replace with a real database (PostgreSQL, MongoDB, etc.)
    """

    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.request_logs: List[RequestLog] = []
        self.error_logs: List[ErrorLog] = []
        self.active_users: Dict[str, datetime] = {}  # user_id -> last activity time
        self._initialized = True
    
    # -----------------------------------------------------------------------
    # Request Logging
    # -----------------------------------------------------------------------
    
    # Function: log_request
    # Purpose:  Record metadata about an API request for audit trail
    # Input:    user_id, endpoint, method, status, duration, filename, success
    # Output:   RequestLog entry added to in-memory database
    # Why needed:
    #   Admin dashboard needs visibility into all requests: who called what,
    #   when, and whether it succeeded. This enables usage patterns,
    #   performance monitoring, and troubleshooting.
    def log_request(
        self,
        user_id: str,
        endpoint: str,
        method: str,
        status_code: int,
        duration_ms: float,
        filename: str = "",
        success: bool = True
    ) -> None:
        """
        Log an API request.
        
        Args:
            user_id:      User making the request.
            endpoint:     API endpoint (e.g., "/process-call").
            method:       HTTP method ("GET", "POST", etc.).
            status_code:  HTTP response status (200, 400, 500).
            duration_ms:  Request duration in milliseconds.
            filename:     Uploaded filename (optional).
            success:      Whether request succeeded (True/False).
        """
        log = RequestLog(
            timestamp=datetime.utcnow().isoformat(),
            user_id=user_id,
            endpoint=endpoint,
            method=method,
            status_code=status_code,
            duration_ms=duration_ms,
            filename=filename,
            success=success
        )
        self.request_logs.append(log)
        self._record_user_activity(user_id)
    
    # -----------------------------------------------------------------------
    # Error Logging
    # -----------------------------------------------------------------------
    
    # Function: log_error
    # Purpose:  Record exceptions and failures for debugging and alerting
    # Input:    user_id, error_type, message, endpoint, details
    # Output:   ErrorLog entry added to in-memory database
    # Why needed:
    #   Errors must be tracked separately so admins can see what's failing,
    #   how often, and under what conditions. Helps prioritize fixes.
    def log_error(
        self,
        user_id: str,
        error_type: str,
        message: str,
        endpoint: str,
        details: str = ""
    ) -> None:
        """
        Log an error or exception.
        
        Args:
            user_id:   User when error occurred (or "system").
            error_type: Exception class (e.g., "ValueError").
            message:    Error message.
            endpoint:   API endpoint where error occurred.
            details:    Full traceback or context (optional).
        """
        log = ErrorLog(
            timestamp=datetime.utcnow().isoformat(),
            user_id=user_id,
            error_type=error_type,
            message=message,
            endpoint=endpoint,
            details=details
        )
        self.error_logs.append(log)
    
    # -----------------------------------------------------------------------
    # User Activity
    # -----------------------------------------------------------------------
    
    # Function: _record_user_activity
    # Purpose:  Update "last seen" timestamp for a user
    # Input:    user_id (str) — user identifier
    # Output:   active_users dict updated with current timestamp
    # Why needed:
    #   Admins need to see who is currently using the system.
    #   This tracks when each user last made a request.
    def _record_user_activity(self, user_id: str) -> None:
        """
        Internal: update user's last activity timestamp.
        """
        self.active_users[user_id] = datetime.utcnow()
    
    # -----------------------------------------------------------------------
    # Statistics Queries (for Admin Dashboard)
    # -----------------------------------------------------------------------
    
    # Function: get_stats
    # Purpose:  Aggregate summary statistics for admin dashboard
    # Input:    None
    # Output:   dict with total requests, success rate, error count, etc.
    # Why needed:
    #   Admin dashboard shows high-level health metrics at a glance.
    #   Helps detect system issues or unusual activity.
    def get_stats(self) -> dict:
        """
        Get aggregate statistics for admin dashboard.
        
        Returns:
            {
                "total_requests": int,
                "successful_requests": int,
                "failed_requests": int,
                "success_rate_percent": float,
                "total_errors": int,
                "active_user_count": int,
                "avg_request_duration_ms": float,
                "timestamp": str (ISO 8601)
            }
        """
        total = len(self.request_logs)
        successful = sum(1 for log in self.request_logs if log.success)
        failed = total - successful
        
        success_rate = (successful / total * 100) if total > 0 else 0
        
        avg_duration = (
            sum(log.duration_ms for log in self.request_logs) / total
            if total > 0
            else 0
        )
        
        return {
            "total_requests": total,
            "successful_requests": successful,
            "failed_requests": failed,
            "success_rate_percent": round(success_rate, 2),
            "total_errors": len(self.error_logs),
            "active_user_count": len(self.active_users),
            "avg_request_duration_ms": round(avg_duration, 2),
            "timestamp": datetime.utcnow().isoformat()
        }
    
    # Function: get_request_logs
    # Purpose:  Retrieve recent request logs for debugging/monitoring
    # Input:    limit (int) — max number of logs to return (recent first)
    # Output:   list[dict] — sorted by timestamp descending
    # Why needed:
    #   Admins need to see recent activity to understand what happened
    #   and debug issues. Limiting prevents huge responses.
    def get_request_logs(self, limit: int = 50) -> list:
        """
        Get recent request logs.
        
        Args:
            limit: Maximum number of logs to return (default 50).
        
        Returns:
            List of request log dicts sorted by timestamp (newest first).
        """
        # Sort by timestamp descending (newest first)
        sorted_logs = sorted(
            self.request_logs,
            key=lambda x: x.timestamp,
            reverse=True
        )
        return [asdict(log) for log in sorted_logs[:limit]]
    
    # Function: get_error_logs
    # Purpose:  Retrieve recent errors for alerting and debugging
    # Input:    limit (int) — max number of error logs to return
    # Output:   list[dict] — sorted by timestamp descending
    # Why needed:
    #   Errors must be visible to admins immediately for rapid response.
    #   Helps identify systemic issues vs. one-off failures.
    def get_error_logs(self, limit: int = 50) -> list:
        """
        Get recent error logs.
        
        Args:
            limit: Maximum number of logs to return (default 50).
        
        Returns:
            List of error log dicts sorted by timestamp (newest first).
        """
        sorted_logs = sorted(
            self.error_logs,
            key=lambda x: x.timestamp,
            reverse=True
        )
        return [asdict(log) for log in sorted_logs[:limit]]
    
    # Function: get_user_stats
    # Purpose:  Aggregate stats per user for usage monitoring
    # Input:    None
    # Output:   dict mapping user_id to request count and success rate
    # Why needed:
    #   Admins can see which users are active, heavy users, and who has
    #   high failure rates (may need support or account review).
    def get_user_stats(self) -> dict:
        """
        Get per-user statistics.
        
        Returns:
            {
                "user_id": {
                    "request_count": int,
                    "successful": int,
                    "failed": int,
                    "success_rate_percent": float,
                    "last_activity": str (ISO 8601)
                },
                ...
            }
        """
        user_stats = defaultdict(lambda: {
            "request_count": 0,
            "successful": 0,
            "failed": 0
        })
        
        for log in self.request_logs:
            user_stats[log.user_id]["request_count"] += 1
            if log.success:
                user_stats[log.user_id]["successful"] += 1
            else:
                user_stats[log.user_id]["failed"] += 1
        
        # Add last activity and success rate
        result = {}
        for user_id, stats in user_stats.items():
            success_rate = (
                stats["successful"] / stats["request_count"] * 100
                if stats["request_count"] > 0
                else 0
            )
            result[user_id] = {
                **stats,
                "success_rate_percent": round(success_rate, 2),
                "last_activity": (
                    self.active_users.get(user_id, datetime.utcnow()).isoformat()
                )
            }
        
        return result
    
    # Function: get_endpoint_stats
    # Purpose:  Aggregate stats per endpoint for API health monitoring
    # Input:    None
    # Output:   dict mapping endpoint to request count, status breakdown
    # Why needed:
    #   Admins can see which endpoints are heavily used and which may have
    #   issues (high error rates). Helps with performance tuning.
    def get_endpoint_stats(self) -> dict:
        """
        Get per-endpoint statistics.
        
        Returns:
            {
                "/endpoint": {
                    "total_requests": int,
                    "success_count": int,
                    "failure_count": int,
                    "avg_duration_ms": float
                },
                ...
            }
        """
        endpoint_stats = defaultdict(lambda: {
            "total_requests": 0,
            "success_count": 0,
            "failure_count": 0,
            "durations": []
        })
        
        for log in self.request_logs:
            ep = log.endpoint
            endpoint_stats[ep]["total_requests"] += 1
            endpoint_stats[ep]["durations"].append(log.duration_ms)
            if log.success:
                endpoint_stats[ep]["success_count"] += 1
            else:
                endpoint_stats[ep]["failure_count"] += 1
        
        # Calculate averages and clean up
        result = {}
        for endpoint, stats in endpoint_stats.items():
            avg_duration = (
                sum(stats["durations"]) / len(stats["durations"])
                if stats["durations"]
                else 0
            )
            result[endpoint] = {
                "total_requests": stats["total_requests"],
                "success_count": stats["success_count"],
                "failure_count": stats["failure_count"],
                "avg_duration_ms": round(avg_duration, 2)
            }
        
        return result
    
    # Function: clear_logs
    # Purpose:  Reset all logs (only for testing/demo)
    # Input:    None
    # Output:   All logs cleared
    # Why needed:
    #   For testing and demo purposes only. In production, logs are archived
    #   to a persistent database and never cleared.
    def clear_logs(self) -> None:
        """
        Clear all logs (development/testing only).
        """
        self.request_logs.clear()
        self.error_logs.clear()
        self.active_users.clear()


# Global singleton instance
admin_db = AdminDB()
