from fastapi import Depends, HTTPException, status
from backend.models.user import User
from dependencies.auth import get_current_user

def require_role(required_roles: list[str]):
    def role_checker(current_user=Depends(get_current_user)):
        if current_user.role not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: insufficient permissions"
            )
        return current_user
    return role_checker 
