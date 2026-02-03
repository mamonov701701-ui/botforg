"""
AI Service for BotForg
Provides integration with various AI models (OpenAI, Anthropic, etc.)
Перед вызовом LLM применяется маскирование PII (152-ФЗ).
"""

import httpx
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import os

from backend.utils.pii_scrubber import scrub_text


class AIMessage(BaseModel):
    role: str  # "system", "user", "assistant"
    content: str


class AIRequest(BaseModel):
    model: str
    messages: List[AIMessage]
    temperature: float = 0.7
    max_tokens: int = 1000
    stream: bool = False


class AIResponse(BaseModel):
    content: str
    model: str
    usage: Dict[str, int]
    finish_reason: str


class AIService:
    """Service for AI model integrations"""

    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        
        # Model mappings
        self.model_providers = {
            "gpt-4": "openai",
            "gpt-4-turbo": "openai",
            "gpt-3.5-turbo": "openai",
            "claude-3-opus": "anthropic",
            "claude-3-sonnet": "anthropic",
            "claude-3-haiku": "anthropic",
            "gemini-pro": "google",
        }
    
    async def chat(self, request: AIRequest) -> AIResponse:
        """Send a chat request to AI model. PII in messages is scrubbed before sending."""
        # Маскируем PII во всех сообщениях перед отправкой в LLM
        scrubbed_messages = [
            AIMessage(role=m.role, content=scrub_text(m.content))
            for m in request.messages
        ]
        scrubbed_request = AIRequest(
            model=request.model,
            messages=scrubbed_messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
            stream=request.stream,
        )
        provider = self.model_providers.get(scrubbed_request.model, "openai")
        if provider == "openai":
            return await self._openai_chat(scrubbed_request)
        elif provider == "anthropic":
            return await self._anthropic_chat(scrubbed_request)
        else:
            raise ValueError(f"Unsupported model: {scrubbed_request.model}")
    
    async def _openai_chat(self, request: AIRequest) -> AIResponse:
        """Send request to OpenAI API"""
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY not configured")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": request.model,
                    "messages": [{"role": m.role, "content": m.content} for m in request.messages],
                    "temperature": request.temperature,
                    "max_tokens": request.max_tokens,
                },
                timeout=60.0,
            )
            
            if response.status_code != 200:
                error_data = response.json()
                raise Exception(f"OpenAI API error: {error_data.get('error', {}).get('message', 'Unknown error')}")
            
            data = response.json()
            choice = data["choices"][0]
            
            return AIResponse(
                content=choice["message"]["content"],
                model=data["model"],
                usage=data.get("usage", {}),
                finish_reason=choice["finish_reason"],
            )
    
    async def _anthropic_chat(self, request: AIRequest) -> AIResponse:
        """Send request to Anthropic API"""
        if not self.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY not configured")
        
        # Convert messages for Anthropic format
        system_message = ""
        chat_messages = []
        for msg in request.messages:
            if msg.role == "system":
                system_message = msg.content
            else:
                chat_messages.append({
                    "role": msg.role,
                    "content": msg.content,
                })
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": request.model,
                    "system": system_message,
                    "messages": chat_messages,
                    "temperature": request.temperature,
                    "max_tokens": request.max_tokens,
                },
                timeout=60.0,
            )
            
            if response.status_code != 200:
                error_data = response.json()
                raise Exception(f"Anthropic API error: {error_data.get('error', {}).get('message', 'Unknown error')}")
            
            data = response.json()
            
            return AIResponse(
                content=data["content"][0]["text"],
                model=data["model"],
                usage={
                    "prompt_tokens": data.get("usage", {}).get("input_tokens", 0),
                    "completion_tokens": data.get("usage", {}).get("output_tokens", 0),
                    "total_tokens": data.get("usage", {}).get("input_tokens", 0) + data.get("usage", {}).get("output_tokens", 0),
                },
                finish_reason=data.get("stop_reason", "end_turn"),
            )
    
    async def generate_image(
        self,
        prompt: str,
        model: str = "dall-e-3",
        size: str = "1024x1024",
        quality: str = "standard",
    ) -> str:
        """Generate image using AI. Prompt is PII-scrubbed before sending."""
        prompt = scrub_text(prompt)
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY not configured")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "prompt": prompt,
                    "size": size,
                    "quality": quality,
                    "n": 1,
                },
                timeout=120.0,
            )
            
            if response.status_code != 200:
                error_data = response.json()
                raise Exception(f"OpenAI API error: {error_data.get('error', {}).get('message', 'Unknown error')}")
            
            data = response.json()
            return data["data"][0]["url"]
    
    async def text_to_speech(
        self,
        text: str,
        voice: str = "alloy",
        model: str = "tts-1",
        speed: float = 1.0,
    ) -> bytes:
        """Convert text to speech. Text is PII-scrubbed before sending."""
        text = scrub_text(text)
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY not configured")
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "input": text,
                    "voice": voice,
                    "speed": speed,
                },
                timeout=60.0,
            )
            
            if response.status_code != 200:
                raise Exception(f"OpenAI TTS error: {response.status_code}")
            
            return response.content


# Global instance
ai_service = AIService()

