from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.model_catalog import LLMModel
from app.schemas.model import ModelRead

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=list[ModelRead])
@router.get("/", response_model=list[ModelRead])
async def list_models(db: AsyncSession = Depends(get_db)) -> list[ModelRead]:
    result = await db.execute(select(LLMModel).order_by(LLMModel.provider, LLMModel.display_name))
    records = result.scalars().all()
    return [ModelRead.model_validate(record) for record in records]
