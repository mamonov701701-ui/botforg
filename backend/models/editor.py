from sqlalchemy import Column, Integer, String, ForeignKey, JSON
from backend.database import Base

class Node(Base):
    __tablename__ = "nodes"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("bot_templates.id"), nullable=False)
    type = Column(String, nullable=False)
    position_x = Column(Integer)
    position_y = Column(Integer)
    data = Column(JSON)

class Edge(Base):
    __tablename__ = "edges"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("bot_templates.id"), nullable=False)
    source = Column(String, nullable=False)
    target = Column(String, nullable=False)
    type = Column(String)
    label = Column(String)
    data = Column(JSON)
