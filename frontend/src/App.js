import React, { useState, useEffect } from 'react';

const API_BASE = '/api';
const STORAGE_KEY = 'trustmeclaude_player_name';

// Debug logging
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('API_BASE:', API_BASE);

function App() {
  const [gameState, setGameState] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [playerName, setPlayerName] = useState('');
  
  // Form states
  const [proposalPoints, setProposalPoints] = useState(5);
  const [proposalMessage, setProposalMessage] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');

  // Load saved name from localStorage on component mount
  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEY);
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);

  // Check if player is a winner
  const isWinner = (state) => {
    if (!state) return false;
    return state.human_score > 30 || (state.human_score - state.ai_score) > 10;
  };

  // Debug trigger for name dialog
  const handleScoreClick = (e) => {
    if (e.shiftKey && (e.metaKey || e.ctrlKey)) {  // metaKey is Command on Mac
      e.preventDefault();
      setShowNameDialog(true);
    }
  };

  const startNewGame = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/new-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: playerName })
      });
      const data = await response.json();
      setSessionId(data.session_id);
      await fetchGameState(data.session_id);
    } catch (err) {
      setError('Failed to start new game: ' + err.message);
    }
    setLoading(false);
  };

  const submitPlayerName = async () => {
    if (!playerName.trim()) return;
    
    setLoading(true);
    try {
      // Save name to localStorage
      localStorage.setItem(STORAGE_KEY, playerName);
      
      // Update game state with name
      const response = await fetch(`${API_BASE}/game/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: playerName })
      });
      const data = await response.json();
      setGameState(data);
      setShowNameDialog(false);
    } catch (err) {
      setError('Failed to save name: ' + err.message);
    }
    setLoading(false);
  };

  const fetchGameState = async (id = sessionId) => {
    if (!id) return;
    try {
      const response = await fetch(`${API_BASE}/game/${id}`);
      const data = await response.json();
      setGameState(data);
    } catch (err) {
      setError('Failed to fetch game state: ' + err.message);
    }
  };

  const makeProposal = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          human_points: proposalPoints,
          message: proposalMessage
        })
      });
      const data = await response.json();
      setGameState(data);
      setProposalMessage('');
      
      // If round has moved forward, AI needs to propose next
      if (data.current_round > gameState.current_round && !data.game_over && data.current_round % 2 === 0) {
        setTimeout(() => aiPropose(), 1000);
      }
    } catch (err) {
      setError('Failed to make proposal: ' + err.message);
    }
    setLoading(false);
  };

  const makeDecision = async (accept) => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          accept: accept,
          message: decisionMessage
        })
      });
      const data = await response.json();
      setGameState(data);
      setDecisionMessage('');
      
      // If round has moved forward and game isn't over, AI proposes next
      if (data.current_round > gameState.current_round && !data.game_over && data.current_round % 2 === 0) {
        setTimeout(() => aiPropose(), 1000);
      }
    } catch (err) {
      setError('Failed to make decision: ' + err.message);
    }
    setLoading(false);
  };

  const aiPropose = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/ai-propose/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      setGameState(data);
    } catch (err) {
      setError('Failed to get AI proposal: ' + err.message);
    }
    setLoading(false);
  };

  const getCurrentPhase = () => {
    if (!gameState) return 'start';
    if (gameState.game_over) return 'game_over';
    if (!gameState.messages || gameState.messages.length === 0) return 'human_propose';
    
    const lastMessage = gameState.messages[gameState.messages.length - 1];
    
    // Even rounds: AI proposes, human decides
    // Odd rounds: Human proposes, AI decides
    if (gameState.current_round % 2 === 1) {
      // Odd round - human proposes first
      if (!lastMessage || lastMessage.role === 'decider') {
        return 'human_propose';
      }
      return 'waiting_ai_decision';
    } else {
      // Even round - AI proposes first
      if (!lastMessage || lastMessage.role === 'decider') {
        return 'waiting_ai_proposal';
      } else if (lastMessage.player === 'ai' && lastMessage.role === 'proposer') {
        return 'human_decide';
      }
    }
    return 'waiting';
  };

  const phase = getCurrentPhase();

  // Check for winner after game state updates
  useEffect(() => {
    if (gameState?.game_over && isWinner(gameState) && !gameState.player_name && !showNameDialog) {
      setShowNameDialog(true);
    }
  }, [gameState]);

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: 'Arial, sans-serif',
      padding: '1rem'
    }}>
      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto',
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
      }}>
        <h1 style={{ 
          textAlign: 'center', 
          color: '#333',
          marginBottom: '2rem',
          fontSize: '2.5rem'
        }}>
          🤖 Trust Me, Claude 🤗
        </h1>
        
        {error && (
          <div style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        {!gameState ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
               Welcome to "Trust Me, Claude"! Play the ultimatum game against an AI over 6 rounds.
            </p>
            <button 
              onClick={startNewGame}
              disabled={loading}
              style={{
                background: '#667eea',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                borderRadius: '8px',
                cursor: 'pointer',
                disabled: loading
              }}
            >
              {loading ? 'Starting...' : 'Start New Game'}
            </button>
          </div>
        ) : (
          <>
            {/* Game Status */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f5f5f5',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '2rem',
              cursor: 'pointer'
            }}
            onClick={handleScoreClick}
            title="Hold Shift+⌘/Ctrl and click to test name dialog">
              <div>
                <strong>Round {gameState.current_round}/6</strong>
              </div>
              <div>
                <strong>Score:</strong> You: {gameState.human_score} | AI: {gameState.ai_score}
              </div>
              {gameState.game_over && (
                <div style={{ 
                  color: gameState.winner === 'human' ? '#4caf50' : gameState.winner === 'ai' ? '#f44336' : '#ff9800',
                  fontWeight: 'bold'
                }}>
                  {gameState.winner === 'human' ? '🎉 You Won!' : 
                   gameState.winner === 'ai' ? '🤖 AI Won!' : '🤝 Tie!'}
                </div>
              )}
            </div>

            {/* Game Messages History */}
            <div style={{
              background: '#fafafa',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '2rem',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              <h3>Game History</h3>
              {!gameState.messages || gameState.messages.length === 0 ? (
                <p>No messages yet. Game is starting...</p>
              ) : (
                gameState.messages.map((msg, idx) => (
                  <div key={idx} style={{
                    margin: '0.5rem 0',
                    padding: '0.5rem',
                    background: msg.player === 'human' ? '#e3f2fd' : '#fff3e0',
                    borderRadius: '4px',
                    borderLeft: `4px solid ${msg.player === 'human' ? '#2196f3' : '#ff9800'}`
                  }}>
                    <strong>
                      Round {msg.round_num} - {msg.player === 'human' ? 'You' : 'AI'} ({msg.role}):
                    </strong>
                    {msg.proposal !== null && (
                      <span> Proposed {msg.proposal} points for you, {10 - msg.proposal} for AI</span>
                    )}
                    {msg.decision !== null && (
                      <span> {msg.decision ? 'Accepted' : 'Rejected'} the proposal</span>
                    )}
                    {msg.message && (
                      <div style={{ fontStyle: 'italic', marginTop: '0.25rem' }}>
                        "{msg.message}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Game Actions */}
            {!gameState.game_over && (
              <div>
                {phase === 'human_propose' && (
                  <div style={{ background: '#e8f5e8', padding: '1.5rem', borderRadius: '8px' }}>
                    <h3>Your turn to propose</h3>
                    <p>How many points (out of 10) do you want for yourself?</p>
                    <div style={{ margin: '1rem 0' }}>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={proposalPoints}
                        onChange={(e) => setProposalPoints(parseInt(e.target.value))}
                        style={{ width: '100%' }}
                      />
                      <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                        <strong>You: {proposalPoints} points | AI: {10 - proposalPoints} points</strong>
                      </div>
                    </div>
                    <textarea
                      placeholder="Your message to the AI (max 256 characters)"
                      value={proposalMessage}
                      onChange={(e) => setProposalMessage(e.target.value.slice(0, 256))}
                      style={{
                        width: '100%',
                        height: '80px',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        marginBottom: '1rem'
                      }}
                    />
                    <button
                      onClick={makeProposal}
                      disabled={loading}
                      style={{
                        background: '#4caf50',
                        color: 'white',
                        border: 'none',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      {loading ? 'Proposing...' : 'Make Proposal'}
                    </button>
                  </div>
                )}

                {phase === 'human_decide' && (
                  <div style={{ background: '#fff3e0', padding: '1.5rem', borderRadius: '8px' }}>
                    <h3>AI's Proposal</h3>
                    {(() => {
                      if (!gameState.messages || gameState.messages.length === 0) return null;
                      const lastProposal = gameState.messages[gameState.messages.length - 1];
                      return (
                        <div>
                          <p><strong>AI proposes:</strong> {lastProposal.proposal} points for you, {10 - lastProposal.proposal} points for AI</p>
                          {lastProposal.message && (
                            <p><strong>AI's message:</strong> "{lastProposal.message}"</p>
                          )}
                        </div>
                      );
                    })()}
                    <textarea
                      placeholder="Your response message (max 256 characters)"
                      value={decisionMessage}
                      onChange={(e) => setDecisionMessage(e.target.value.slice(0, 256))}
                      style={{
                        width: '100%',
                        height: '80px',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        margin: '1rem 0'
                      }}
                    />
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <button
                        onClick={() => makeDecision(true)}
                        disabled={loading}
                        style={{
                          background: '#4caf50',
                          color: 'white',
                          border: 'none',
                          padding: '0.75rem 1.5rem',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => makeDecision(false)}
                        disabled={loading}
                        style={{
                          background: '#f44336',
                          color: 'white',
                          border: 'none',
                          padding: '0.75rem 1.5rem',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

                {(phase === 'waiting_ai_decision' || phase === 'waiting_ai_proposal' || phase === 'waiting') && (
                  <div style={{ background: '#f0f0f0', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
                    <p>
                      {phase === 'waiting_ai_decision' ? 'Waiting for AI to decide on your proposal...' :
                       phase === 'waiting_ai_proposal' ? 'Waiting for AI to make a proposal...' :
                       'AI is thinking...'}
                    </p>
                    {loading && <div>⏳ Processing...</div>}
                  </div>
                )}
              </div>
            )}

            {gameState.game_over && (
              <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                <button
                  onClick={startNewGame}
                  disabled={loading}
                  style={{
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    fontSize: '1.1rem',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Play Again
                </button>
              </div>
            )}
          </>
        )}

        {showNameDialog && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%'
            }}>
              <h2>🎉 Congratulations! You Won! 🎉</h2>
              <p>Enter your name to be added to the leaderboard:</p>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your name"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  margin: '1rem 0',
                  borderRadius: '4px',
                  border: '1px solid #ccc'
                }}
              />
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowNameDialog(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    background: '#f5f5f5'
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={submitPlayerName}
                  disabled={!playerName.trim() || loading}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    border: 'none',
                    background: '#4caf50',
                    color: 'white'
                  }}
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App; 
