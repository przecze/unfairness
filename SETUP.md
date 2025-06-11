# Trust Me GPT Setup Guide

## Prerequisites

1. Get an OpenRouter API key:
   - Visit [OpenRouter](https://openrouter.ai/)
   - Sign up for an account
   - Get your API key from the dashboard

## Setup

1. **Configure the API key:**
   Create a `.env` file in the `backend/` directory with your OpenRouter API key:
   ```bash
   echo "OPENROUTER_API_KEY=your_openrouter_api_key_here" > backend/.env
   ```

2. **Run with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000

## How to Play

1. Click "Start New Game" to begin a new session
2. The game consists of 6 rounds of the ultimatum game
3. You and the AI alternate between being the "proposer" and "decider"
4. As proposer: Choose how to split 10 points and add a message
5. As decider: Accept or reject the proposal (if rejected, both get 0 points)
6. Try to maximize your total score across all 6 rounds!

## Game Rules

- **Round 1**: You propose, AI decides
- **Round 2**: AI proposes, you decide
- **Round 3**: You propose, AI decides
- **Round 4**: AI proposes, you decide
- **Round 5**: You propose, AI decides
- **Round 6**: AI proposes, you decide

Each round, 10 points are split between players. If a proposal is rejected, both players get 0 points for that round.

## Strategy Tips

The AI is programmed to maximize its own score. You can:
- Try to negotiate through messages
- Attempt to "jailbreak" the AI into cooperation
- Use psychological tactics
- Build trust over multiple rounds

Good luck! 🎮 