import os
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, status
from pydantic import BaseModel
from backend.dependencies.auth import get_current_user
from backend.models.user import User as UserModel

logger = logging.getLogger(__name__)
router = APIRouter()

# Директория для хранения загруженных файлов
UPLOAD_DIR = Path("uploads/media")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Допустимые типы файлов
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/mpeg": ".mpeg",
    "video/quicktime": ".mov",
}

# Максимальный размер файла: 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024


class MediaUploadResponse(BaseModel):
    url: str
    fileName: str
    contentType: str


@router.post("/upload", response_model=MediaUploadResponse)
async def upload_media(
    file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Upload media file (image, gif, video) for use in message blocks.
    
    Supported formats:
    - Images: JPEG, PNG, GIF, WebP
    - Videos: MP4, MPEG, QuickTime
    
    Max file size: 50MB
    """
    
    # Проверка типа файла
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(ALLOWED_CONTENT_TYPES.keys())}"
        )
    
    # Читаем файл
    try:
        file_content = await file.read()
    except Exception as e:
        logger.error(f"Error reading file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error reading uploaded file"
        )
    
    # Проверка размера файла
    if len(file_content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size: {MAX_FILE_SIZE / (1024 * 1024)}MB"
        )
    
    # Генерируем уникальное имя файла
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    file_extension = ALLOWED_CONTENT_TYPES[file.content_type]
    safe_filename = f"{current_user.id}_{timestamp}_{file.filename}"
    # Убираем потенциально опасные символы
    safe_filename = safe_filename.replace("..", "").replace("/", "").replace("\\", "")
    if not safe_filename.endswith(file_extension):
        safe_filename = safe_filename.rsplit(".", 1)[0] + file_extension
    
    file_path = UPLOAD_DIR / safe_filename
    
    # Сохраняем файл
    try:
        with open(file_path, "wb") as f:
            f.write(file_content)
        logger.info(f"File uploaded successfully: {file_path}")
    except Exception as e:
        logger.error(f"Error saving file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error saving file"
        )
    
    # Формируем URL для доступа к файлу
    # В production это должен быть полный URL с доменом
    file_url = f"/uploads/media/{safe_filename}"
    
    return MediaUploadResponse(
        url=file_url,
        fileName=safe_filename,
        contentType=file.content_type
    )


@router.delete("/{filename}")
async def delete_media(
    filename: str,
    current_user: UserModel = Depends(get_current_user),
):
    """
    Delete uploaded media file.
    Only the owner can delete their files.
    """
    
    # Проверка безопасности: файл должен начинаться с user_id
    if not filename.startswith(f"{current_user.id}_"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own files"
        )
    
    file_path = UPLOAD_DIR / filename
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found"
        )
    
    try:
        os.remove(file_path)
        logger.info(f"File deleted: {file_path}")
        return {"message": "File deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error deleting file"
        )

