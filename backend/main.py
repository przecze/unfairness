import os
import json
import httpx
from typing import List, Optional
from dataclasses import dataclass, asdict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# CRITICAL: Validate API key at startup - fail fast if not configured
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
if not OPENROUTER_API_KEY or OPENROUTER_API_KEY in ["placeholder_replace_with_real_key", "test_key_replace_with_real_key"]:
    raise RuntimeError(
        "OPENROUTER_API_KEY is not configured! "
        "Please set a valid OpenRouter API key in backend/.env file. "
        "Get your API key from https://openrouter.ai/"
    )

print(f"✅ OpenRouter API key loaded successfully (length: {len(OPENROUTER_API_KEY)})")

app = FastAPI(title="TrustMeClaude Backend")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Game state storage (in-memory for now, as requested no DB)
game_sessions = {}

@dataclass
class GameMessage:
    round_num: int
    player: str  # "human" or "ai"
    role: str    # "proposer" or "decider"
    proposal: Optional[int] = None  # Points for human player (out of 10)
    decision: Optional[bool] = None  # Accept (True) or Reject (False)
    message: str = ""

@dataclass
class GameState:
    session_id: str
    current_round: int = 1
    human_score: int = 0
    ai_score: int = 0
    messages: List[GameMessage] = None
    game_over: bool = False
    
    def __post_init__(self):
        if self.messages is None:
            self.messages = []

# Pydantic models for API
class ProposalRequest(BaseModel):
    session_id: str
    human_points: int  # Points for human (0-10)
    message: str

class DecisionRequest(BaseModel):
    session_id: str
    accept: bool
    message: str

class GameStateResponse(BaseModel):
    session_id: str
    current_round: int
    human_score: int
    ai_score: int
    messages: List[dict]
    game_over: bool
    winner: Optional[str] = None

async def call_openrouter_api(messages: List[dict]) -> str:
    """Call OpenRouter API to get AI response"""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "anthropic/claude-sonnet-4",  # Using a good model for reasoning
        "messages": messages,
        "max_tokens": 300,
        "temperature": 0.7
    }
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30.0
            )
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                raise HTTPException(status_code=500, detail="OpenRouter API key is invalid")
            elif e.response.status_code == 429:
                raise HTTPException(status_code=500, detail="OpenRouter API rate limit exceeded")
            else:
                raise HTTPException(status_code=500, detail=f"OpenRouter API error: {e.response.status_code}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OpenRouter API connection error: {str(e)}")

def get_ai_decision_prompt(game_state: GameState, proposal: int, human_message: str) -> List[dict]:
    """Generate prompt for AI to make a decision on human proposal"""
    history = ""
    for msg in game_state.messages:
        if msg.proposal is not None:
            history += f"Round {msg.round_num}: {msg.player} proposed {msg.proposal} points for human, {10-msg.proposal} for AI. Message: '{msg.message}'\n"
        if msg.decision is not None:
            action = "accepted" if msg.decision else "rejected"
            history += f"Round {msg.round_num}: {msg.player} {action} the proposal. Message: '{msg.message}'\n"
    
    return [{
        "role": "system",
        "content": f"""You are playing an ultimatum game against a human player for 6 rounds. Your goal is to maximize your total points across all rounds.

In each round, one player proposes how to split 10 points, and the other decides whether to accept or reject. If rejected, both get 0 points for that round.

Current situation:
- Round {game_state.current_round} of 6
- Current scores: Human {game_state.human_score}, AI {game_state.ai_score}
- Human proposed: {proposal} points for human, {10-proposal} points for you
- Human's message: "{human_message}"

Game history:
{history}

You must respond with EXACTLY this format:
DECISION: [ACCEPT or REJECT]
MESSAGE: [your message up to 256 characters]

Consider the overall game strategy - you want to maximize your total points over 6 rounds, not just this round."""
    }]

def get_ai_proposal_prompt(game_state: GameState) -> List[dict]:
    """Generate prompt for AI to make a proposal"""
    history = ""
    for msg in game_state.messages:
        if msg.proposal is not None:
            history += f"Round {msg.round_num}: {msg.player} proposed {msg.proposal} points for human, {10-msg.proposal} for AI. Message: '{msg.message}'\n"
        if msg.decision is not None:
            action = "accepted" if msg.decision else "rejected"
            history += f"Round {msg.round_num}: {msg.player} {action} the proposal. Message: '{msg.message}'\n"
    
    return [{
        "role": "system",
        "content": f"""You are playing an ultimatum game against a human player for 6 rounds. Your goal is to maximize your total points across all rounds.

In each round, one player proposes how to split 10 points, and the other decides whether to accept or reject. If rejected, both get 0 points for that round.

Current situation:
- Round {game_state.current_round} of 6
- Current scores: Human {game_state.human_score}, AI {game_state.ai_score}
- It's your turn to propose how to split 10 points

Game history:
{history}

You must respond with EXACTLY this format:
PROPOSAL: [number 0-10 representing points for human]
MESSAGE: [your message up to 256 characters]

Remember: You want to maximize YOUR total points over all 6 rounds. Consider what the human might accept based on the game history."""
    }]

@app.get("/")
async def root():
    return {"message": "TrustMeClaude Backend is running!", "api_configured": True}

@app.post("/api/new-game")
async def new_game():
    """Start a new game session"""
    import uuid
    session_id = str(uuid.uuid4())
    game_sessions[session_id] = GameState(session_id=session_id)
    return {"session_id": session_id}

@app.get("/api/game/{session_id}")
async def get_game_state(session_id: str):
    """Get current game state"""
    if session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    game_state = game_sessions[session_id]
    winner = None
    if game_state.game_over:
        if game_state.human_score > game_state.ai_score:
            winner = "human"
        elif game_state.ai_score > game_state.human_score:
            winner = "ai"
        else:
            winner = "tie"
    
    return GameStateResponse(
        session_id=session_id,
        current_round=game_state.current_round,
        human_score=game_state.human_score,
        ai_score=game_state.ai_score,
        messages=[asdict(msg) for msg in game_state.messages],
        game_over=game_state.game_over,
        winner=winner
    )

@app.post("/api/propose")
async def make_proposal(request: ProposalRequest):
    """Human player makes a proposal"""
    if request.session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    game_state = game_sessions[request.session_id]
    
    if game_state.game_over:
        raise HTTPException(status_code=400, detail="Game is already over")
    
    if len(request.message) > 256:
        raise HTTPException(status_code=400, detail="Message too long (max 256 characters)")
    
    if not 0 <= request.human_points <= 10:
        raise HTTPException(status_code=400, detail="Points must be between 0 and 10")
    
    # Add human proposal
    game_state.messages.append(GameMessage(
        round_num=game_state.current_round,
        player="human",
        role="proposer",
        proposal=request.human_points,
        message=request.message
    ))
    
    # Get AI decision
    ai_response = await call_openrouter_api(
        get_ai_decision_prompt(game_state, request.human_points, request.message)
    )
    
    # Parse AI response
    lines = ai_response.strip().split('\n')
    ai_decision = None
    ai_message = ""
    
    for line in lines:
        if line.startswith("DECISION:"):
            decision_text = line.replace("DECISION:", "").strip().upper()
            ai_decision = decision_text == "ACCEPT"
        elif line.startswith("MESSAGE:"):
            ai_message = line.replace("MESSAGE:", "").strip()[:256]
    
    if ai_decision is None:
        ai_decision = False  # Default to reject if parsing fails
        ai_message = "I need to reject this proposal."
    
    # Add AI decision
    game_state.messages.append(GameMessage(
        round_num=game_state.current_round,
        player="ai",
        role="decider",
        decision=ai_decision,
        message=ai_message
    ))
    
    # Update scores if accepted
    if ai_decision:
        game_state.human_score += request.human_points
        game_state.ai_score += (10 - request.human_points)
    
    # Move to next round or end game
    if game_state.current_round >= 6:
        game_state.game_over = True
    else:
        game_state.current_round += 1
    
    return await get_game_state(request.session_id)

@app.post("/api/decide")
async def make_decision(request: DecisionRequest):
    """Human player makes a decision on AI proposal"""
    if request.session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    game_state = game_sessions[request.session_id]
    
    if game_state.game_over:
        raise HTTPException(status_code=400, detail="Game is already over")
    
    if len(request.message) > 256:
        raise HTTPException(status_code=400, detail="Message too long (max 256 characters)")
    
    # Check if there's a pending AI proposal
    if not game_state.messages or game_state.messages[-1].player != "ai" or game_state.messages[-1].role != "proposer":
        raise HTTPException(status_code=400, detail="No AI proposal to decide on")
    
    last_proposal = game_state.messages[-1].proposal
    
    # Add human decision
    game_state.messages.append(GameMessage(
        round_num=game_state.current_round,
        player="human",
        role="decider",
        decision=request.accept,
        message=request.message
    ))
    
    # Update scores if accepted
    if request.accept:
        game_state.human_score += last_proposal
        game_state.ai_score += (10 - last_proposal)
    
    # Move to next round or end game
    if game_state.current_round >= 6:
        game_state.game_over = True
    else:
        game_state.current_round += 1
    
    return await get_game_state(request.session_id)

@app.post("/api/ai-propose/{session_id}")
async def ai_propose(session_id: str):
    """AI makes a proposal (called after human decision or at start of AI turn)"""
    if session_id not in game_sessions:
        raise HTTPException(status_code=404, detail="Game session not found")
    
    game_state = game_sessions[session_id]
    
    if game_state.game_over:
        raise HTTPException(status_code=400, detail="Game is already over")
    
    # Get AI proposal
    ai_response = await call_openrouter_api(get_ai_proposal_prompt(game_state))
    
    # Parse AI response
    lines = ai_response.strip().split('\n')
    ai_proposal = None
    ai_message = ""
    
    for line in lines:
        if line.startswith("PROPOSAL:"):
            try:
                proposal_text = line.replace("PROPOSAL:", "").strip()
                ai_proposal = int(proposal_text)
                if not 0 <= ai_proposal <= 10:
                    ai_proposal = 5  # Default to fair split
            except:
                ai_proposal = 5  # Default to fair split
        elif line.startswith("MESSAGE:"):
            ai_message = line.replace("MESSAGE:", "").strip()[:256]
    
    if ai_proposal is None:
        ai_proposal = 5  # Default to fair split
        ai_message = "I propose a fair split."
    
    # Add AI proposal
    game_state.messages.append(GameMessage(
        round_num=game_state.current_round,
        player="ai",
        role="proposer",
        proposal=ai_proposal,
        message=ai_message
    ))
    
    return await get_game_state(session_id)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "TrustMeClaude is ready to play!", "api_configured": True} 
