from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from database import Base

class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"
    
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(Integer, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    blacklisted_at = Column(DateTime, default=datetime.utcnow)

