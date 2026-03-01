# Out-of-Touch-DND

An LLM-powered Dungeons & Dragons 5th Edition campaign engine where Claude acts as the Dungeon Master. Features a top-down grid map with tokens, hybrid voice + click interaction, and support for both local and virtual play.

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- An Anthropic API key

### Backend Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file in the project root (copy from `.env.example`):

```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

Start the server:

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Playing

1. Click **Create Session** and enter your name
2. Share the room code with friends (they click **Join Session**)
3. Each player creates a character (race, class, ability scores)
4. Start playing! Type your actions in the chat and interact with the map

## Architecture

- **Backend**: Python / FastAPI / WebSockets
- **Frontend**: React + TypeScript + Vite + HTML5 Canvas
- **LLM**: Anthropic Claude with tool use (dice rolls, map generation, combat)
- **Map**: Top-down 2D grid rendered on canvas with pan/zoom and draggable tokens

## Cost

With Claude Sonnet and prompt caching, a typical 3-4 hour session costs ~$4-15 depending on activity level.
