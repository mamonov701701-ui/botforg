"""
Compatibility module for authentication dependencies.
Re-exports from backend.dependencies.auth for backward compatibility.
"""

from backend.dependencies.auth import get_current_user, oauth2_scheme

__all__ = ["get_current_user", "oauth2_scheme"]
