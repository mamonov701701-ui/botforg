import logging
import traceback
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.editor import Edge, Node

# Настройка логирования
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/editor", tags=["Editor"])


# --------- SCHEMAS ---------
class NodeSchema(BaseModel):
    id: int
    template_id: int
    type: str
    position_x: int
    position_y: int
    data: Dict[str, Any]


class EdgeSchema(BaseModel):
    id: int
    template_id: int
    source: str
    target: str
    type: str
    label: str
    data: Dict[str, Any]


class EditorStateSchema(BaseModel):
    nodes: List[NodeSchema]
    edges: List[EdgeSchema]


# --------- ROUTES ---------


@router.get("/{template_id}")
def get_editor_state(template_id: int, db: Session = Depends(get_db)):
    try:
        nodes = db.query(Node).filter(Node.template_id == template_id).all()
        edges = db.query(Edge).filter(Edge.template_id == template_id).all()

        # Преобразуем SQLAlchemy объекты в словари
        node_data = [
            {
                "id": node.id,
                "template_id": node.template_id,
                "type": node.type,
                "position_x": node.position_x,
                "position_y": node.position_y,
                "data": node.data or {},
            }
            for node in nodes
        ]

        edge_data = [
            {
                "id": edge.id,
                "template_id": edge.template_id,
                "source": edge.source,
                "target": edge.target,
                "type": edge.type or "",
                "label": edge.label or "",
                "data": edge.data or {},
            }
            for edge in edges
        ]

        return {"nodes": node_data, "edges": edge_data}
    except Exception as e:
        logger.error(f"Error in get_editor_state: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{template_id}")
def save_editor_state(
    template_id: int, state: Dict[str, Any], db: Session = Depends(get_db)
):
    try:
        logger.info(f"Starting save_editor_state for template_id: {template_id}")
        logger.info(f"Received state: {state}")

        # Проверяем, существует ли template_id в bot_templates
        from backend.models.bot_template import BotTemplate

        template_exists = (
            db.query(BotTemplate).filter(BotTemplate.id == template_id).first()
        )
        if not template_exists:
            logger.error(
                f"Template with id {template_id} not found in bot_templates table"
            )
            raise HTTPException(
                status_code=404, detail=f"Template with id {template_id} not found"
            )

        logger.info(f"Template {template_id} exists, proceeding with save")

        # Очистить старое
        deleted_nodes = db.query(Node).filter(Node.template_id == template_id).delete()
        deleted_edges = db.query(Edge).filter(Edge.template_id == template_id).delete()
        logger.info(f"Deleted {deleted_nodes} nodes and {deleted_edges} edges")

        # Добавить новое
        nodes_to_add = state.get("nodes", [])
        edges_to_add = state.get("edges", [])

        logger.info(f"Adding {len(nodes_to_add)} nodes and {len(edges_to_add)} edges")

        for i, node_data in enumerate(nodes_to_add):
            logger.debug(f"Processing node {i}: {node_data}")
            # Убеждаемся, что template_id установлен правильно
            node_data["template_id"] = template_id
            db.add(Node(**node_data))

        for i, edge_data in enumerate(edges_to_add):
            logger.debug(f"Processing edge {i}: {edge_data}")
            # Убеждаемся, что template_id установлен правильно
            edge_data["template_id"] = template_id
            db.add(Edge(**edge_data))

        db.commit()
        logger.info("Successfully saved editor state")
        return {"detail": "Saved"}

    except HTTPException:
        # Перебрасываем HTTPException как есть
        raise
    except Exception as e:
        logger.error(f"Error in save_editor_state: {str(e)}")
        logger.error(traceback.format_exc())
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
