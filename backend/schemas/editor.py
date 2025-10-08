from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel


class NodeBase(BaseModel):
    node_id: str
    type: Optional[str] = None
    position_x: int
    position_y: int
    data: Optional[Dict[str, Any]] = None


class NodeCreate(NodeBase):
    template_id: int


class NodeUpdate(BaseModel):
    type: Optional[str] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    data: Optional[Dict[str, Any]] = None


class NodeRead(NodeBase):
    id: int
    template_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EdgeBase(BaseModel):
    edge_id: str
    source: str
    target: str
    type: Optional[str] = None
    label: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class EdgeCreate(EdgeBase):
    template_id: int


class EdgeUpdate(BaseModel):
    source: Optional[str] = None
    target: Optional[str] = None
    type: Optional[str] = None
    label: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class EdgeRead(EdgeBase):
    id: int
    template_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EditorState(BaseModel):
    nodes: list[NodeRead]
    edges: list[EdgeRead]


class EditorStateCreate(BaseModel):
    nodes: list[NodeCreate]
    edges: list[EdgeCreate]
