"""
Runtime сервис для исполнения сценариев бота.
Обрабатывает выполнение блоков и переходы между сценариями.
"""
from typing import Any, Dict, List, Optional
from datetime import datetime
import logging

from sqlalchemy.orm import Session

from backend.models.scenario import Scenario, SCENARIO_STATUS_PUBLISHED
from backend.models.event import Event, ScenarioExecution, ScenarioEvent, UserSession
from backend.models.bot_user_state import BotUserState


logger = logging.getLogger(__name__)


class ScenarioRuntimeError(Exception):
    """Ошибка выполнения сценария"""
    def __init__(self, message: str, node_id: Optional[str] = None):
        self.message = message
        self.node_id = node_id
        super().__init__(message)


class ScenarioContext:
    """Контекст выполнения сценария"""
    def __init__(
        self,
        user_id: int,
        bot_id: int,
        scenario_id: int,
        variables: Optional[Dict[str, Any]] = None,
        previous_scenario_id: Optional[int] = None,
        previous_node_id: Optional[str] = None,
    ):
        self.user_id = user_id
        self.bot_id = bot_id
        self.scenario_id = scenario_id
        self.variables = variables or {}
        self.previous_scenario_id = previous_scenario_id
        self.previous_node_id = previous_node_id
        self.nodes_visited: List[str] = []
        self.current_node_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "bot_id": self.bot_id,
            "scenario_id": self.scenario_id,
            "variables": self.variables,
            "previous_scenario_id": self.previous_scenario_id,
            "previous_node_id": self.previous_node_id,
            "nodes_visited": self.nodes_visited,
            "current_node_id": self.current_node_id,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ScenarioContext":
        ctx = cls(
            user_id=data["user_id"],
            bot_id=data["bot_id"],
            scenario_id=data["scenario_id"],
            variables=data.get("variables", {}),
            previous_scenario_id=data.get("previous_scenario_id"),
            previous_node_id=data.get("previous_node_id"),
        )
        ctx.nodes_visited = data.get("nodes_visited", [])
        ctx.current_node_id = data.get("current_node_id")
        return ctx


class ScenarioRuntime:
    """Runtime для исполнения сценариев"""
    
    def __init__(self, db: Session):
        self.db = db

    def _track_scenario_event(
        self,
        *,
        scenario_id: int,
        user_id: Optional[int],
        step: Optional[str],
        event_type: str,
        bot_id: Optional[int] = None,
    ) -> None:
        self.db.add(
            ScenarioEvent(
                scenario_id=scenario_id,
                user_id=user_id,
                step=step,
                event_type=event_type,
            )
        )
        # Совместимый поток событий для общей аналитики.
        self.db.add(
            Event(
                event_type=event_type,
                event_name=f"scenario_{event_type}",
                user_id=user_id,
                bot_id=bot_id,
                scenario_id=scenario_id,
                node_id=step,
                payload={},
            )
        )
    
    def get_scenario(self, scenario_id: int) -> Optional[Scenario]:
        """Получить сценарий по ID"""
        return self.db.query(Scenario).filter(Scenario.id == scenario_id).first()

    def _get_execution_content(self, scenario: Scenario) -> Optional[Dict[str, Any]]:
        """Контент для выполнения: бот использует только published."""
        if scenario.published_content:
            return scenario.published_content
        if scenario.status != SCENARIO_STATUS_PUBLISHED:
            return None
        return scenario.content

    def get_start_node(self, scenario: Scenario) -> Optional[Dict[str, Any]]:
        """Найти стартовый узел сценария (блок 'start')"""
        content = self._get_execution_content(scenario)
        if not content or "nodes" not in content:
            return None
        
        for node in content["nodes"]:
            node_data = node.get("data", {})
            if node_data.get("blockId") == "start":
                return node
        
        # Если нет блока start, возвращаем первый узел
        nodes = content.get("nodes", [])
        return nodes[0] if nodes else None
    
    def get_node_by_id(self, scenario: Scenario, node_id: str) -> Optional[Dict[str, Any]]:
        """Найти узел по ID"""
        content = self._get_execution_content(scenario)
        if not content or "nodes" not in content:
            return None
        
        for node in content["nodes"]:
            if node.get("id") == node_id:
                return node
        
        return None
    
    def execute_go_to_scenario(
        self,
        context: ScenarioContext,
        block_settings: Dict[str, Any],
    ) -> ScenarioContext:
        """
        Выполнить блок 'go_to_scenario' - переход в другой сценарий.
        
        Args:
            context: Текущий контекст выполнения
            block_settings: Настройки блока go_to_scenario:
                - targetScenarioId: ID целевого сценария
                - startMode: 'from_start' или 'from_step'
                - targetNodeId: ID стартового узла (если startMode == 'from_step')
                - preserveContext: сохранять ли переменные (по умолчанию True)
        
        Returns:
            Новый контекст выполнения для целевого сценария
        
        Raises:
            ScenarioRuntimeError: Если целевой сценарий не найден или произошла ошибка
        """
        target_scenario_id = block_settings.get("targetScenarioId")
        start_mode = block_settings.get("startMode", "from_start")
        target_node_id = block_settings.get("targetNodeId")
        preserve_context = block_settings.get("preserveContext", True)
        
        # Валидация
        if not target_scenario_id:
            raise ScenarioRuntimeError(
                "Не указан целевой сценарий",
                node_id=context.current_node_id
            )
        
        # Получаем целевой сценарий
        target_scenario = self.get_scenario(target_scenario_id)
        if not target_scenario:
            raise ScenarioRuntimeError(
                f"Сценарий с ID {target_scenario_id} не найден",
                node_id=context.current_node_id
            )
        
        # Определяем стартовый узел
        if start_mode == "from_step" and target_node_id:
            start_node = self.get_node_by_id(target_scenario, target_node_id)
            if not start_node:
                raise ScenarioRuntimeError(
                    f"Узел {target_node_id} не найден в сценарии {target_scenario.name}",
                    node_id=context.current_node_id
                )
        else:
            start_node = self.get_start_node(target_scenario)
            if not start_node:
                raise ScenarioRuntimeError(
                    f"В сценарии {target_scenario.name} нет стартового узла",
                    node_id=context.current_node_id
                )
        
        # Логирование перехода
        logger.info(
            f"Переход из сценария {context.scenario_id} в сценарий {target_scenario_id} "
            f"(пользователь: {context.user_id}, узел: {start_node.get('id')})"
        )
        
        # Создаём новый контекст
        new_context = ScenarioContext(
            user_id=context.user_id,
            bot_id=context.bot_id,
            scenario_id=target_scenario_id,
            variables=context.variables if preserve_context else {},
            previous_scenario_id=context.scenario_id,
            previous_node_id=context.current_node_id,
        )
        new_context.current_node_id = start_node.get("id")
        
        return new_context
    
    def start_scenario_execution(
        self,
        context: ScenarioContext,
    ) -> ScenarioExecution:
        """Начать отслеживание выполнения сценария"""
        execution = ScenarioExecution(
            scenario_id=context.scenario_id,
            bot_id=context.bot_id,
            user_id=context.user_id,
            status="started",
            input_data=context.variables,
            nodes_visited=[],
            current_node=context.current_node_id,
        )
        self.db.add(execution)
        self.db.add(
            UserSession(
                user_id=context.user_id,
                scenario_id=context.scenario_id,
                status="active",
            )
        )
        self._track_scenario_event(
            scenario_id=context.scenario_id,
            user_id=context.user_id,
            step=context.current_node_id,
            event_type="enter_step",
            bot_id=context.bot_id,
        )
        self.db.commit()
        self.db.refresh(execution)
        return execution
    
    def complete_scenario_execution(
        self,
        execution_id: int,
        context: ScenarioContext,
        status: str = "completed",
        error_message: Optional[str] = None,
    ) -> Optional[ScenarioExecution]:
        """Завершить отслеживание выполнения сценария"""
        execution = self.db.query(ScenarioExecution).filter(
            ScenarioExecution.id == execution_id
        ).first()
        
        if not execution:
            return None
        
        execution.status = status
        execution.completed_at = datetime.utcnow()
        execution.nodes_visited = context.nodes_visited
        execution.output_data = context.variables
        
        if error_message:
            execution.error_message = error_message
            execution.error_node = context.current_node_id

        session = (
            self.db.query(UserSession)
            .filter(
                UserSession.user_id == context.user_id,
                UserSession.scenario_id == context.scenario_id,
                UserSession.status == "active",
            )
            .order_by(UserSession.started_at.desc())
            .first()
        )
        if session:
            session.finished_at = datetime.utcnow()
            session.status = "completed" if status == "completed" else "dropped"

        event_type = "complete" if status == "completed" else "drop"
        self._track_scenario_event(
            scenario_id=context.scenario_id,
            user_id=context.user_id,
            step=context.current_node_id,
            event_type=event_type,
            bot_id=context.bot_id,
        )
        
        # Вычисляем длительность
        if execution.started_at:
            delta = execution.completed_at - execution.started_at
            execution.duration_ms = int(delta.total_seconds() * 1000)
        
        self.db.commit()
        self.db.refresh(execution)
        return execution
    
    def save_user_state(
        self,
        context: ScenarioContext,
    ) -> None:
        """Сохранить состояние пользователя"""
        from datetime import datetime, timezone
        
        # Ищем существующее состояние
        state = self.db.query(BotUserState).filter(
            BotUserState.bot_id == context.bot_id,
            BotUserState.telegram_user_id == str(context.user_id),
        ).first()
        
        now = datetime.now(timezone.utc)
        
        previous_node_id = state.current_node_id if state else None
        if state:
            # Обновляем
            state.current_scenario_id = context.scenario_id
            state.current_node_id = context.current_node_id
            state.context = context.to_dict()
            state.last_interaction_at = now
            # Если был inactive, активируем при новом взаимодействии
            if state.status == "inactive":
                state.status = "active"
        else:
            # Создаём новое
            # Пытаемся извлечь имя из context, если оно было сохранено
            name = context.variables.get("name") or context.variables.get("user_name")
            
            state = BotUserState(
                bot_id=context.bot_id,
                telegram_user_id=str(context.user_id),
                channel="telegram",  # По умолчанию telegram, можно расширить
                status="active",
                name=name,
                current_scenario_id=context.scenario_id,
                current_node_id=context.current_node_id,
                context=context.to_dict(),
                last_interaction_at=now,
            )
            self.db.add(state)

        if context.current_node_id and previous_node_id != context.current_node_id:
            self._track_scenario_event(
                scenario_id=context.scenario_id,
                user_id=context.user_id,
                step=context.current_node_id,
                event_type="enter_step",
                bot_id=context.bot_id,
            )
        
        self.db.commit()
    
    def load_user_state(
        self,
        bot_id: int,
        user_id: int,
    ) -> Optional[ScenarioContext]:
        """Загрузить состояние пользователя"""
        state = self.db.query(BotUserState).filter(
            BotUserState.bot_id == bot_id,
            BotUserState.telegram_user_id == user_id,
        ).first()
        
        if not state or not state.context:
            return None
        
        return ScenarioContext.from_dict(state.context)


def process_go_to_scenario_block(
    db: Session,
    context: ScenarioContext,
    block_settings: Dict[str, Any],
) -> ScenarioContext:
    """
    Удобная функция для обработки блока go_to_scenario.
    
    Использование:
        from backend.services.scenario_runtime import process_go_to_scenario_block, ScenarioContext
        
        # При выполнении блока go_to_scenario:
        new_context = process_go_to_scenario_block(db, context, block_settings)
        
        # new_context содержит новый сценарий и стартовый узел
    """
    runtime = ScenarioRuntime(db)
    return runtime.execute_go_to_scenario(context, block_settings)

