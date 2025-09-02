from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship

from datetime import datetime
from typing import Optional
from backend.models.tag import template_tags
from backend.database import Base

class Template(Base):
    __tablename__ = "templates"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    category = Column(String, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    content = Column(JSON, nullable=True)

    user = relationship("User", back_populates="templates")
    ratings = relationship("Rating", back_populates="template", cascade="all, delete")
    comments = relationship("Comment", back_populates="template", cascade="all, delete")
    purchases = relationship("Purchase", back_populates="template", cascade="all, delete")

    tags = relationship("Tag", secondary=template_tags, back_populates="templates")
    nodes = relationship("Node", back_populates="template", cascade="all, delete")
    edges = relationship("Edge", back_populates="template", cascade="all, delete")
