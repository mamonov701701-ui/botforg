"""
AI Router for BotForg
Provides AI-related endpoints for chat, image generation, etc.
152-ФЗ: отправка текста в AI разрешена только при явном флаге allow_send_text_to_ai в настройках.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session

from backend.auth.deps import get_current_user
from backend.database import get_db
from backend.models.user import User, UserSettings
from backend.services.ai_service import ai_service, AIMessage, AIRequest, AIResponse


router = APIRouter(prefix="/ai", tags=["AI"])


def _allow_send_text_to_ai(db: Session, user_id: int) -> bool:
    """Проверка флага «Разрешить отправку текста в AI» (по умолчанию OFF)."""
    row = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not row or not row.agent_settings:
        return False
    return row.agent_settings.get("allow_send_text_to_ai") is True


class ChatRequest(BaseModel):
    model: str = "gpt-3.5-turbo"
    system_prompt: Optional[str] = None
    user_message: str
    conversation_history: List[dict] = []
    temperature: float = 0.7
    max_tokens: int = 1000


class ChatResponse(BaseModel):
    response: str
    model: str
    usage: dict


class ImageRequest(BaseModel):
    prompt: str
    model: str = "dall-e-3"
    size: str = "1024x1024"
    quality: str = "standard"


class ImageResponse(BaseModel):
    url: str


class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"
    speed: float = 1.0


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Send a message to AI chat model.
    Requires authentication and разрешение «Разрешить отправку текста в AI» в настройках.
    """
    if not _allow_send_text_to_ai(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Отправка текста в AI отключена. Включите в настройках: «Разрешить отправку текста в AI».",
        )
    try:
        # Build messages list
        messages = []
        
        # Add system prompt if provided
        if request.system_prompt:
            messages.append(AIMessage(role="system", content=request.system_prompt))
        
        # Add conversation history
        for msg in request.conversation_history:
            messages.append(AIMessage(role=msg.get("role", "user"), content=msg.get("content", "")))
        
        # Add current user message
        messages.append(AIMessage(role="user", content=request.user_message))
        
        # Create AI request
        ai_request = AIRequest(
            model=request.model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )
        
        # Get response
        response = await ai_service.chat(ai_request)
        
        return ChatResponse(
            response=response.content,
            model=response.model,
            usage=response.usage,
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI service error: {str(e)}",
        )


@router.post("/image", response_model=ImageResponse)
async def generate_image(
    request: ImageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate an image using AI.
    Requires authentication and разрешение «Разрешить отправку текста в AI».
    """
    if not _allow_send_text_to_ai(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Отправка текста в AI отключена. Включите в настройках: «Разрешить отправку текста в AI».",
        )
    try:
        url = await ai_service.generate_image(
            prompt=request.prompt,
            model=request.model,
            size=request.size,
            quality=request.quality,
        )
        
        return ImageResponse(url=url)
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI service error: {str(e)}",
        )


@router.post("/tts")
async def text_to_speech(
    request: TTSRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Convert text to speech using AI.
    Returns audio file bytes.
    Requires authentication and разрешение «Разрешить отправку текста в AI».
    """
    from fastapi.responses import Response

    if not _allow_send_text_to_ai(db, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Отправка текста в AI отключена. Включите в настройках: «Разрешить отправку текста в AI».",
        )
    try:
        audio_bytes = await ai_service.text_to_speech(
            text=request.text,
            voice=request.voice,
            speed=request.speed,
        )
        
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "attachment; filename=speech.mp3"
            }
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI service error: {str(e)}",
        )


@router.get("/models")
async def get_available_models(
    current_user: User = Depends(get_current_user),
):
    """
    Get list of available AI models.
    """
    return {
        "chat_models": [
            {"id": "gpt-4", "name": "GPT-4", "provider": "openai"},
            {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "provider": "openai"},
            {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "provider": "openai"},
            {"id": "claude-3-opus", "name": "Claude 3 Opus", "provider": "anthropic"},
            {"id": "claude-3-sonnet", "name": "Claude 3 Sonnet", "provider": "anthropic"},
            {"id": "claude-3-haiku", "name": "Claude 3 Haiku", "provider": "anthropic"},
        ],
        "image_models": [
            {"id": "dall-e-3", "name": "DALL-E 3", "provider": "openai"},
            {"id": "dall-e-2", "name": "DALL-E 2", "provider": "openai"},
        ],
        "tts_voices": [
            {"id": "alloy", "name": "Alloy"},
            {"id": "echo", "name": "Echo"},
            {"id": "fable", "name": "Fable"},
            {"id": "onyx", "name": "Onyx"},
            {"id": "nova", "name": "Nova"},
            {"id": "shimmer", "name": "Shimmer"},
        ]
    }

