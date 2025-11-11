#!/usr/bin/env python3
"""Создаем тестовый сценарий с nodes и edges для проверки отображения"""

import asyncio
from sqlalchemy.orm import Session
from database import SessionLocal
from models.scenario import Scenario
import models.user
import models.bot
import json

def create_test_scenario():
    """Создает тестовый сценарий с несколькими нодами и связями"""
    db: Session = SessionLocal()
    
    try:
        # Найдем demo user
        user = db.query(models.user.User).filter(models.user.User.email == "demo@bot.ru").first()
        if not user:
            print("❌ Demo user not found!")
            return
        
        # Найдем bot 58
        bot = db.query(models.bot.Bot).filter(models.bot.Bot.id == 58, models.bot.Bot.user_id == user.id).first()
        if not bot:
            print(f"❌ Bot 58 not found for user {user.email}!")
            return
        
        # Получим главный сценарий
        main_scenario = db.query(Scenario).filter(
            Scenario.bot_id == 58,
            Scenario.name == "Главный"
        ).first()
        
        if not main_scenario:
            print("❌ Main scenario not found!")
            return
        
        # Создаем nodes с edges
        test_nodes = [
            {
                "id": "start-1",
                "type": "default",
                "position": {"x": 100, "y": 100},
                "data": {
                    "blockId": "start",
                    "title": "Начало",
                    "icon": "▶️",
                    "color": "#4A90E2",
                    "settings": {}
                },
                "style": {"borderColor": "#4A90E2"}
            },
            {
                "id": "message-1",
                "type": "default",
                "position": {"x": 400, "y": 100},
                "data": {
                    "blockId": "message",
                    "title": "Сообщение",
                    "icon": "💬",
                    "color": "#3498DB",
                    "settings": {"text": "Привет! Это тестовое сообщение."}
                },
                "style": {"borderColor": "#3498DB"}
            },
            {
                "id": "message-2",
                "type": "default",
                "position": {"x": 700, "y": 100},
                "data": {
                    "blockId": "message",
                    "title": "Сообщение 2",
                    "icon": "💬",
                    "color": "#3498DB",
                    "settings": {"text": "Второе сообщение для проверки."}
                },
                "style": {"borderColor": "#3498DB"}
            }
        ]
        
        test_edges = [
            {
                "id": "start-1-message-1",
                "source": "start-1",
                "target": "message-1",
                "type": "default",
                "animated": False,
                "markerEnd": {
                    "type": "arrowclosed",
                    "width": 30,
                    "height": 30,
                    "color": "#FFB300"
                },
                "style": {
                    "stroke": "#FFB300",
                    "strokeWidth": 4
                }
            },
            {
                "id": "message-1-message-2",
                "source": "message-1",
                "target": "message-2",
                "type": "default",
                "animated": False,
                "markerEnd": {
                    "type": "arrowclosed",
                    "width": 30,
                    "height": 30,
                    "color": "#FFB300"
                },
                "style": {
                    "stroke": "#FFB300",
                    "strokeWidth": 4
                }
            }
        ]
        
        # Обновляем content сценария
        main_scenario.content = {
            "nodes": test_nodes,
            "edges": test_edges
        }
        
        db.commit()
        
        print(f"✅ Test scenario created!")
        print(f"   Nodes: {len(test_nodes)}")
        print(f"   Edges: {len(test_edges)}")
        print(f"   Bot ID: {bot.id}")
        print(f"   Scenario ID: {main_scenario.id}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_test_scenario()

