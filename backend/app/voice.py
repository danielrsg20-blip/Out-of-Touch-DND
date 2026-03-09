"""Voice pipeline: Speech-to-Text (Whisper) and Text-to-Speech (OpenAI TTS)."""

from __future__ import annotations

import io
import logging
import hashlib
import math
import wave
from typing import Optional

try:
    import openai
except ModuleNotFoundError:  # pragma: no cover - optional in local mock mode
    openai = None  # type: ignore[assignment]

from .config import OPENAI_API_KEY, LOCAL_MOCK_MODE

logger = logging.getLogger(__name__)

_client: Optional[object] = None


def _mock_tts_wav(text: str) -> bytes:
    """Generate a short deterministic WAV tone for local/dev voice testing."""
    sample_rate = 16000
    duration_seconds = max(0.35, min(1.2, len(text) * 0.018))
    sample_count = int(sample_rate * duration_seconds)
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    freq = 360 + (digest[0] % 280)
    amplitude = 7000

    pcm = bytearray()
    for i in range(sample_count):
        envelope = min(1.0, i / 400.0) * min(1.0, (sample_count - i) / 400.0)
        value = int(amplitude * envelope * math.sin(2 * math.pi * freq * (i / sample_rate)))
        pcm.extend(int(value).to_bytes(2, byteorder="little", signed=True))

    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(pcm))
    return out.getvalue()


def _get_client() -> object:
    global _client
    if _client is None:
        if openai is None:
            raise RuntimeError("openai package is not installed for voice features")
        if not OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY not configured for voice features")
        _client = openai.OpenAI(api_key=OPENAI_API_KEY)
    return _client


async def speech_to_text(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio bytes to text using OpenAI Whisper."""
    if LOCAL_MOCK_MODE:
        digest = hashlib.sha256(audio_bytes or b"mock-audio").hexdigest()[:8]
        return f"[mock transcript {digest}] I look around carefully and proceed forward."

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
    except Exception as e:
        logger.error("Whisper STT error: %s", e)
        raise


async def text_to_speech(
    text: str,
    voice: str = "alloy",
    model: str = "tts-1",
    response_format: str = "mp3",
) -> bytes:
    """Convert text to speech audio bytes using OpenAI TTS."""
    if LOCAL_MOCK_MODE:
        return _mock_tts_wav(text)

    client = _get_client()

    try:
        response = client.audio.speech.create(
            model=model,
            voice=voice,
            input=text,
            response_format=response_format,
        )
        return response.content
    except Exception as e:
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


def mock_tts_audio(text: str) -> bytes:
    """Public helper for forcing mock TTS audio in dev/test flows."""
    return _mock_tts_wav(text)
