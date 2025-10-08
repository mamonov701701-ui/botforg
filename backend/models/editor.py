from sqlalchemy import JSON, Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from backend.database import Base


class Node(Base):
    __tablename__ = "nodes"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(
        Integer,
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type = Column(String, nullable=False)
    position_x = Column(Integer)
    position_y = Column(Integer)
    data = Column(JSON)

    template = relationship("Template", back_populates="nodes")


class Edge(Base):
    __tablename__ = "edges"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(
        Integer,
        ForeignKey("templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source = Column(String, nullable=False)
    target = Column(String, nullable=False)
    type = Column(String)
    label = Column(String)
    data = Column(JSON)

    template = relationship("Template", back_populates="edges")
