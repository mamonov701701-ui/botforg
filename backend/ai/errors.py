class AiProviderError(Exception):
    code="provider_unknown"; retryable=False
    def __init__(self, message="Provider request failed"): self.message=message; super().__init__(message)
class AiProviderTimeout(AiProviderError): code="provider_timeout"; retryable=True
class AiProviderAuthenticationError(AiProviderError): code="provider_authentication"
class AiProviderRateLimited(AiProviderError): code="provider_rate_limited"; retryable=True
class AiProviderInvalidRequest(AiProviderError): code="provider_invalid_request"
class AiProviderUnavailable(AiProviderError): code="provider_unavailable"; retryable=True
class AiProviderModelUnavailable(AiProviderError): code="provider_model_unavailable"; retryable=True
class AiProviderPolicyRefusal(AiProviderError): code="provider_policy_refusal"
class AiProviderMalformedResponse(AiProviderError): code="provider_malformed_response"
class AiProviderUnknownError(AiProviderError): pass
