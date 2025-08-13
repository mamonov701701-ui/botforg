from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Review(Base):
    __tablename__ = 'reviews'
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey('templates.id'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    rating = Column(Integer, nullable=False)
    text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    template = relationship('Template')
    user = relationship('User') 