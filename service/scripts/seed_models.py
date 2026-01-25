import asyncio
from datetime import datetime, timezone

from app.db.session import AsyncSessionLocal
from app.models.model_catalog import LLMModel


# Embedded seed data - models are compiled into the code
MODEL_SEEDS = [
    # Anthropic Models (OpenRouter format)
    {
        "id": "claude-sonnet-4.5",
        "display_name": "Anthropic Claude 4.5 Sonnet",
        "provider": "anthropic",
        "api_identifier": "anthropic/claude-sonnet-4.5",
        "native_api_identifier": "claude-sonnet-4-5",
        "description": "Anthropic's most capable model, excellent for complex reasoning and analysis",
    },
    {
        "id": "claude-3.7-sonnet",
        "display_name": "Anthropic Claude 3.7 Sonnet",
        "provider": "anthropic",
        "api_identifier": "anthropic/claude-3.7-sonnet",
        "native_api_identifier": "claude-3-7-sonnet-latest",
        "description": "Hybrid reasoning approach, allowing users to choose between rapid responses and extended, step-by-step processing for complex tasks",
    },
    # OpenAI Models (OpenRouter format)
    {
        "id": "gpt-5.1",
        "display_name": "OpenAI GPT-5.1",
        "provider": "openai",
        "api_identifier": "openai/gpt-5.1",
        "native_api_identifier": "gpt-5.1-2025-11-13",
        "description": "OpenAI's advanced model with improved performance and lower cost",
    },
    {
        "id": "gpt-5.2",
        "display_name": "OpenAI GPT-5.2",
        "provider": "openai",
        "api_identifier": "openai/gpt-5.2",
        "native_api_identifier": "gpt-5.2-2025-12-11",
        "description": "OpenAI's fast and cost-effective model for most tasks",
    },
    {
        "id": "gpt-oss-120b",
        "display_name": "OpenAI GPT-OSS 120b",
        "provider": "openai",
        "api_identifier": "openai/gpt-oss-120b",
        "native_api_identifier": "gpt-oss-120b",
        "description": "OpenAI OSS",
    },
    # Google Models (OpenRouter format)
    {
        "id": "gemini-2.5-pro",
        "display_name": "Google Gemini 2.5 Pro",
        "provider": "google",
        "api_identifier": "google/gemini-2.5-pro",
        "native_api_identifier": "gemini-2.5-pro",
        "description": "Google's advanced multimodal model",
    },
    {
        "id": "gemini-2.5-flash",
        "display_name": "Google Gemini 2.5 Flash",
        "provider": "google",
        "api_identifier": "google/gemini-2.5-flash",
        "native_api_identifier": "gemini-2.5-flash",
        "description": "Google's most capable model for complex tasks",
    },
    {
        "id": "gemini-3-pro-preview",
        "display_name": "Gemini 3 Pro Preview",
        "provider": "google",
        "api_identifier": "google/gemini-3-pro-preview",
        "native_api_identifier": "gemini-3-pro-preview",
        "description": "Google Gemini 3 Pro",
    },
    # DeepSeek Models (OpenRouter format)
    {
        "id": "deepseek-3.2",
        "display_name": "DeepSeek v3.2",
        "provider": "deepseek",
        "api_identifier": "deepseek/deepseek-v3.2",
        "native_api_identifier": "deepseek-reasoner",
        "description": "DeepSeek's general-purpose conversational model",
    },
    {
        "id": "deepseek-r1",
        "display_name": "DeepSeek R1",
        "provider": "deepseek",
        "api_identifier": "deepseek/deepseek-r1",
        "native_api_identifier": "deepseek-r1",
        "description": "DeepSeek's specialized model for code generation",
    },
    # xAI Models (OpenRouter format: x-ai with hyphen)
    {
        "id": "grok4",
        "display_name": "xAI Grok 4",
        "provider": "xai",
        "api_identifier": "x-ai/grok-4",
        "native_api_identifier": "grok-4-0709",
        "description": "xAI Grok 4",
    },
    {
        "id": "grok4.1-fast",
        "display_name": "xAI Grok 4.1 Fast",
        "provider": "xai",
        "api_identifier": "x-ai/grok-4.1-fast",
        "native_api_identifier": "grok-4-1-fast-reasoning",
        "description": "xAI Grok 4.1 Fast",
    }
]


async def seed() -> None:
    """Seed LLM models from embedded data."""
    async with AsyncSessionLocal() as session:
        for seed in MODEL_SEEDS:
            record = await session.get(LLMModel, seed["id"])
            if record:
                # Update existing record
                record.display_name = seed["display_name"]
                record.provider = seed["provider"]
                record.api_identifier = seed["api_identifier"]
                record.native_api_identifier = seed.get("native_api_identifier")
                record.description = seed.get("description")
            else:
                # Create new record
                entry = LLMModel(
                    id=seed["id"],
                    display_name=seed["display_name"],
                    provider=seed["provider"],
                    api_identifier=seed["api_identifier"],
                    native_api_identifier=seed.get("native_api_identifier"),
                    description=seed.get("description"),
                )
                session.add(entry)
        await session.commit()
        
        print(f"[OK] Seeded {len(MODEL_SEEDS)} LLM models")


if __name__ == "__main__":
    asyncio.run(seed())
