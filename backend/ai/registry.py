from backend.ai.providers import AiProvider, MockAiProvider
_REGISTRY: dict[str, AiProvider] = {"mock": MockAiProvider()}
def get_provider(code: str) -> AiProvider | None: return _REGISTRY.get((code or "").strip().lower())
