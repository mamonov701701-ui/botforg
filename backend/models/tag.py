from sqlalchemy import Column, Integer, String, Table, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base

template_tags = Table(
    "template_tags",
    Base.metadata,
    Column("template_id", Integer, ForeignKey("templates.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id"), primary_key=True),
    extend_existing=True
)

class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)

    templates = relationship("Template", secondary=template_tags, back_populates="tags") 
