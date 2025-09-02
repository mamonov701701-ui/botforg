from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"))  # владелец команды
    user_id = Column(Integer, ForeignKey("users.id"))   # приглашённый участник
    role = Column(String, default="observer")
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", foreign_keys=[owner_id], back_populates="owned_teams")
    user = relationship("User", foreign_keys=[user_id], back_populates="member_in_teams") 
