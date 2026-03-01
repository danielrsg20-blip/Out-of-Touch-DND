"""Voice pipeline: Speech-to-Text (Whisper) and Text-to-Speech (OpenAI TTS)."""

from __future__ import annotations

import io
import logging
from typing import Optional

import openai

from .config import OPENAI_API_KEY

logger = logging.getLogger(__name__)

_client: openai.OpenAI | None = None


def _get_client() -> openai.OpenAI:
    global _client
    if _client is None:
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY not configured for voice features")
        _client = openai.OpenAI(api_key=OPENAI_API_KEY)
    return _client


async def speech_to_text(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio bytes to text using OpenAI Whisper."""
    client = _get_client()
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    try:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="text",
        )
        return transcript.strip()
    except openai.APIError as e:
        logger.error("Whisper STT error: %s", e)
        raise


async def text_to_speech(
    text: str,
    voice: str = "alloy",
    model: str = "tts-1",
    response_format: str = "mp3",
) -> bytes:
    """Convert text to speech audio bytes using OpenAI TTS."""
    client = _get_client()

    try:
        response = client.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
            response_format=response_format,
        )
        return response.content
    except openai.APIError as e:
        logger.error("TTS error: %s", e)
        raise


TTS_VOICES = {
    "dm_default": "onyx",
    "dm_female": "nova",
    "npc_friendly": "alloy",
    "npc_mysterious": "echo",
    "npc_gruff": "fable",
    "npc_young": "shimmer",
}


async def dm_speak(text: str, voice_key: str = "dm_default") -> bytes:
    """Generate DM narration audio with a specific voice."""
    voice = TTS_VOICES.get(voice_key, "onyx")
    return await text_to_speech(text, voice=voice)
