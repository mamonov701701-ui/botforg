"""
Скрипт для тестирования выполнения сценария пошагово
Симулирует работу пользователя в мессенджере
"""
import sys
import os
import json

project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models.bot import Bot
from backend.models.scenario import Scenario
from backend.models.bot_user_state import BotUserState

def test_scenario_execution(bot_id: int):
    """Тестирует выполнение сценария пошагово"""
    db: Session = SessionLocal()
    
    try:
        # Получаем бота
        bot = db.query(Bot).filter(Bot.id == bot_id).first()
        if not bot:
            print(f"Ошибка: Бот с ID {bot_id} не найден")
            return
        
        # Получаем главный сценарий
        scenario = db.query(Scenario).filter(
            Scenario.bot_id == bot_id,
            Scenario.is_main == True
        ).first()
        
        if not scenario:
            print(f"Ошибка: Главный сценарий для бота {bot_id} не найден")
            return
        
        print(f"Бот: {bot.title} (ID: {bot.id})")
        print(f"Сценарий: {scenario.name} (ID: {scenario.id})")
        print("\n" + "="*60)
        
        # Получаем content сценария
        content = scenario.content or {}
        nodes = content.get("nodes", [])
        edges = content.get("edges", [])
        
        if not nodes:
            print("Ошибка: В сценарии нет блоков")
            return
        
        print(f"Блоков в сценарии: {len(nodes)}")
        print(f"Соединений: {len(edges)}")
        print("\n" + "="*60)
        
        # Находим стартовый блок
        start_node = None
        for node in nodes:
            node_data = node.get("data", {})
            if node_data.get("blockId") == "start":
                start_node = node
                break
        
        if not start_node:
            print("Предупреждение: Стартовый блок не найден, используем первый блок")
            start_node = nodes[0]
        
        print(f"\nШАГ 1: Стартовый блок")
        print(f"  ID: {start_node['id']}")
        print(f"  Тип: {start_node['data'].get('blockId', 'unknown')}")
        print(f"  Название: {start_node['data'].get('title', 'Без названия')}")
        
        # Находим следующий блок
        next_edges = [e for e in edges if e["source"] == start_node["id"]]
        if not next_edges:
            print("  Ошибка: Нет исходящих соединений от стартового блока")
            return
        
        next_edge = next_edges[0]
        next_node_id = next_edge["target"]
        next_node = next((n for n in nodes if n["id"] == next_node_id), None)
        
        if not next_node:
            print(f"  Ошибка: Следующий блок {next_node_id} не найден")
            return
        
        print(f"\nШАГ 2: Переход к следующему блоку")
        print(f"  ID: {next_node['id']}")
        print(f"  Тип: {next_node['data'].get('blockId', 'unknown')}")
        print(f"  Название: {next_node['data'].get('title', 'Без названия')}")
        
        # Проверяем, есть ли кнопки
        settings = next_node['data'].get('settings', {})
        buttons = settings.get('buttons', [])
        
        if buttons:
            print(f"  Кнопки найдены: {len(buttons)}")
            for i, btn in enumerate(buttons):
                print(f"    {i+1}. {btn.get('label', 'Без названия')}")
        
        # Проверяем текст сообщения
        text = settings.get('text', '')
        if text:
            # Убираем эмодзи для безопасного вывода
            text_clean = text[:50].encode('ascii', 'ignore').decode('ascii')
            print(f"  Текст сообщения: {text_clean}...")
        
        # Если это блок condition, проверяем ветвление
        if next_node['data'].get('blockId') == 'condition':
            print(f"\nШАГ 3: Блок условия")
            cond_settings = settings
            print(f"  Переменная: {cond_settings.get('variable', 'N/A')}")
            print(f"  Оператор: {cond_settings.get('operator', 'N/A')}")
            print(f"  Значение: {cond_settings.get('value', 'N/A')}")
            
            # Находим обе ветки
            cond_edges = [e for e in edges if e["source"] == next_node["id"]]
            true_edge = next((e for e in cond_edges if e.get("sourceHandle") == "true"), None)
            false_edge = next((e for e in cond_edges if e.get("sourceHandle") == "false"), None)
            
            if true_edge:
                true_node = next((n for n in nodes if n["id"] == true_edge["target"]), None)
                if true_node:
                    print(f"\n  Ветка TRUE:")
                    print(f"    ID: {true_node['id']}")
                    print(f"    Название: {true_node['data'].get('title', 'Без названия')}")
                    true_text = true_node['data'].get('settings', {}).get('text', '')
                    if true_text:
                        print(f"    Текст: {true_text[:50]}...")
            
            if false_edge:
                false_node = next((n for n in nodes if n["id"] == false_edge["target"]), None)
                if false_node:
                    print(f"\n  Ветка FALSE:")
                    print(f"    ID: {false_node['id']}")
                    print(f"    Название: {false_node['data'].get('title', 'Без названия')}")
                    false_text = false_node['data'].get('settings', {}).get('text', '')
                    if false_text:
                        print(f"    Текст: {false_text[:50]}...")
        
        print("\n" + "="*60)
        print("Тестирование структуры сценария завершено успешно!")
        print("\nПроверка целостности:")
        
        # Проверяем целостность
        errors = []
        for edge in edges:
            source_exists = any(n["id"] == edge["source"] for n in nodes)
            target_exists = any(n["id"] == edge["target"] for n in nodes)
            if not source_exists:
                errors.append(f"Соединение {edge['id']}: источник {edge['source']} не найден")
            if not target_exists:
                errors.append(f"Соединение {edge['id']}: цель {edge['target']} не найдена")
        
        if errors:
            print("  Найдены ошибки:")
            for error in errors:
                print(f"    - {error}")
        else:
            print("  Все соединения корректны")
        
        # Проверяем наличие стартового блока
        has_start = any(n.get("data", {}).get("blockId") == "start" for n in nodes)
        if has_start:
            print("  Стартовый блок найден")
        else:
            print("  Предупреждение: Стартовый блок не найден")
        
    except Exception as e:
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    import sys
    import io
    # Устанавливаем UTF-8 для вывода
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    
    bot_id = 197  # ID созданного тестового бота
    print("Тестирование выполнения сценария...\n")
    test_scenario_execution(bot_id)
