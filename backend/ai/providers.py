from abc import ABC, abstractmethod
from backend.ai.contracts import AiProviderRequest, AiProviderResponse
from backend.ai.errors import AiProviderTimeout, AiProviderRateLimited, AiProviderUnavailable, AiProviderAuthenticationError, AiProviderMalformedResponse, AiProviderPolicyRefusal

class AiProvider(ABC):
    code: str
    @abstractmethod
    def execute(self, request: AiProviderRequest) -> AiProviderResponse: ...

class MockAiProvider(AiProvider):
    code="mock"
    def execute(self, request):
        behavior=request.parameters.get("mock_behavior", "success")
        errors={"timeout":AiProviderTimeout,"rate_limit":AiProviderRateLimited,"unavailable":AiProviderUnavailable,"auth":AiProviderAuthenticationError,"malformed":AiProviderMalformedResponse,"refusal":AiProviderPolicyRefusal}
        if behavior in errors: raise errors[behavior]()
        usage=dict(request.parameters.get("mock_usage", {"input_tokens": 1, "output_tokens": 1}))
        return AiProviderResponse("mock", request.model, request.input or "mock response", {"text": request.input or "mock response"} if request.structured_output_schema else None, usage, f"mock:{request.idempotency_key}", 1, "stop", request.parameters.get("mock_cost"), "USD")
