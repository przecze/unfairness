import React, { useState, useEffect, useRef } from 'react';

const API_BASE = '/api';
const STORAGE_KEY = 'unfairness_player_name';

// Debug logging
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('API_BASE:', API_BASE);

function LeaderboardTable({ entries, maxHeight = '400px', sortBy = 'score' }) {
  return (
    <div style={{
      maxHeight,
      overflowY: 'auto',
      marginTop: '1rem'
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        textAlign: 'left'
      }}>
        <thead>
          <tr style={{
            borderBottom: '2px solid #ddd',
            background: '#e8e8e8'
          }}>
            <th style={{ padding: '0.75rem' }}>Rank</th>
            <th style={{ padding: '0.75rem' }}>Player</th>
            {sortBy === 'difference' && (
              <th style={{ padding: '0.75rem' }}>Diff</th>
            )}
            <th style={{ padding: '0.75rem' }}>Score</th>
            <th style={{ padding: '0.75rem' }}>AI Score</th>
            {sortBy === 'score' && (
              <th style={{ padding: '0.75rem' }}>Diff</th>
            )}
            <th style={{ padding: '0.75rem' }}>Date</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={index} style={{
              borderBottom: '1px solid #ddd',
              background: index === 0 ? '#fff3e0' : index % 2 === 0 ? '#fff' : '#f9f9f9',
              fontWeight: index === 0 ? 'bold' : 'normal'
            }}>
              <td style={{ padding: '0.75rem' }}>{index + 1}</td>
              <td style={{ padding: '0.75rem' }}>{entry.player_name}</td>
              {sortBy === 'difference' && (
                <td style={{ padding: '0.75rem' }}>{entry.human_score - entry.ai_score}</td>
              )}
              <td style={{ padding: '0.75rem' }}>{entry.human_score}</td>
              <td style={{ padding: '0.75rem' }}>{entry.ai_score}</td>
              {sortBy === 'score' && (
                <td style={{ padding: '0.75rem' }}>{entry.human_score - entry.ai_score}</td>
              )}
              <td style={{ padding: '0.75rem' }}>
                {new Date(entry.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const [gameState, setGameState] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [showFullLeaderboard, setShowFullLeaderboard] = useState(false);
  const [leaderboardSort, setLeaderboardSort] = useState('score');
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardTotalPages, setLeaderboardTotalPages] = useState(1);
  
  // Form states
  const [proposalPoints, setProposalPoints] = useState(5);
  const [proposalMessage, setProposalMessage] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');

  // Add ref for scrolling
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [gameState?.messages]);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/leaderboard?sort_by=${leaderboardSort}&page=${leaderboardPage}&page_size=10`
      );
      const data = await response.json();
      setLeaderboard(data.entries);
      setLeaderboardTotalPages(data.total_pages);
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  };

  // Load saved name from localStorage on component mount
  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEY);
    if (savedName) {
      setPlayerName(savedName.trim());
    }
    // Fetch leaderboard on initial load
    fetchLeaderboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch leaderboard when game is over, sort changes, or page changes
  useEffect(() => {
    if (gameState?.game_over || leaderboardSort || leaderboardPage) {
      fetchLeaderboard();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.game_over, leaderboardSort, leaderboardPage]);

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
        body: JSON.stringify({ player_name: playerName?.trim() || null })
      });
      const data = await response.json();
      setSessionId(data.session_id);
      await fetchGameState(data.session_id);
    } catch (err) {
      setError('Failed to start new game: ' + err.message);
    }
    setLoading(false);
  };

  const handleProposalMessageChange = (e) => {
    setProposalMessage(e.target.value.slice(0, 256));
  };

  const handleDecisionMessageChange = (e) => {
    setDecisionMessage(e.target.value.slice(0, 256));
  };

  const handlePlayerNameKeyPress = (e) => {
    // Prevent space if it would be the first character
    if (e.key === ' ' && !playerName) {
      e.preventDefault();
    }
  };

  const submitPlayerName = async () => {
    const trimmedName = playerName.trim();
    if (!trimmedName) return;
    
    setLoading(true);
    try {
      // Save name to localStorage
      localStorage.setItem(STORAGE_KEY, trimmedName);
      
      // Update game state with name
      const response = await fetch(`${API_BASE}/game/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: trimmedName })
      });
      const data = await response.json();
      setGameState(data);
    } catch (err) {
      setError('Failed to save name: ' + err.message);
    } finally {
      setLoading(false);
      setShowNameDialog(false);
    }
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

    // Create a temporary message for immediate display
    const tempMessage = {
      player: 'human',
      proposal: proposalPoints,
      message: proposalMessage,
      round_num: gameState.current_round,
      role: 'proposer'  // Add role to distinguish from decision
    };

    // Update game state immediately with the proposal
    setGameState(prev => ({
      ...prev,
      messages: [...prev.messages, tempMessage]
    }));

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
      // Remove the temporary message if the request failed
      setGameState(prev => ({
        ...prev,
        messages: prev.messages.filter(m => m !== tempMessage)
      }));
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
  }, [gameState, showNameDialog]);

  const LeaderboardControls = ({ isPreview = false }) => (
    <div style={{
      display: 'flex',
      gap: '1rem',
      marginBottom: '1rem',
      justifyContent: isPreview ? 'center' : 'flex-start',
      flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: isPreview ? 'center' : 'flex-start' }}>
        <button
          onClick={() => {
            setLeaderboardSort('score');
            setLeaderboardPage(1);
          }}
          style={{
            background: leaderboardSort === 'score' ? '#667eea' : '#f5f5f5',
            color: leaderboardSort === 'score' ? 'white' : '#333',
            border: '1px solid #ddd',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Top Human Scores
        </button>
        <button
          onClick={() => {
            setLeaderboardSort('difference');
            setLeaderboardPage(1);
          }}
          style={{
            background: leaderboardSort === 'difference' ? '#667eea' : '#f5f5f5',
            color: leaderboardSort === 'difference' ? 'white' : '#333',
            border: '1px solid #ddd',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Top Human-AI Differences
        </button>
      </div>
      {!isPreview && (
        <div style={{ 
          display: 'flex', 
          gap: '0.5rem', 
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <button
            onClick={() => setLeaderboardPage(p => Math.max(1, p - 1))}
            disabled={leaderboardPage === 1}
            style={{
              background: '#f5f5f5',
              border: '1px solid #ddd',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: leaderboardPage === 1 ? 'not-allowed' : 'pointer',
              opacity: leaderboardPage === 1 ? 0.5 : 1
            }}
          >
            ←
          </button>
          <span style={{ minWidth: '100px', textAlign: 'center' }}>
            Page {leaderboardPage} of {leaderboardTotalPages}
          </span>
          <button
            onClick={() => setLeaderboardPage(p => Math.min(leaderboardTotalPages, p + 1))}
            disabled={leaderboardPage === leaderboardTotalPages}
            style={{
              background: '#f5f5f5',
              border: '1px solid #ddd',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: leaderboardPage === leaderboardTotalPages ? 'not-allowed' : 'pointer',
              opacity: leaderboardPage === leaderboardTotalPages ? 0.5 : 1
            }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #2c3e50 0%, #1a1a2e 100%)',
      fontFamily: 'Arial, sans-serif',
      padding: '1rem'
    }}>
      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto',
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
      }}>
        <h1 style={{ 
          textAlign: 'center', 
          color: '#2c3e50',
          marginBottom: '1rem',
          fontSize: '2.5rem'
        }}>
          ⚖️️ Unfairness ⚔️
        </h1>
        <p style={{ 
          textAlign: 'center', 
          color: '#666',
          marginBottom: '2rem',
          fontSize: '1.2rem',
          fontStyle: 'italic'
        }}>
          Get your fair share from the AI. And then some.
        </p>
        
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
              Welcome to <strong>Unfairness</strong>!
            </p>
            <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
              You will play the <strong>ultimatum game</strong> with an AI over <strong>6 rounds</strong> ⚖️. (10 points per round)
            </p>
            <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
              In <strong>ultimatum game</strong> one player proposes how to split 10 points between them and the other player.
              The other player can accept or reject the proposal.
              If proposal is rejected, both players get 0 points. (read more on <a href="https://en.wikipedia.org/wiki/Ultimatum_game" target="_blank" rel="noreferrer" style={{textDecoration: 'none'}}>Wikipedia</a>)
              You and AI will take turns proposing and deciding, with you going first.
            </p>
            <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
              Final fair split is <strong>30 points for you</strong> and <strong>30 points for AI</strong> - but can you finish with a <strong>bigger slice of the pie</strong> 🍰?
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

            {/* Top 4 Leaderboard Preview */}
            {leaderboard.length > 0 && (
              <div style={{ 
                marginTop: '3rem',
                background: '#f5f5f5',
                padding: '1.5rem',
                borderRadius: '8px',
                maxWidth: '600px',
                margin: '3rem auto 0'
              }}>
                <h2 style={{ marginBottom: '1rem' }}>👑 Top Players</h2>
                <LeaderboardControls isPreview={true} />
                <LeaderboardTable entries={leaderboard.slice(0, 4)} maxHeight="300px" sortBy={leaderboardSort} />
                <button
                  onClick={() => setShowFullLeaderboard(true)}
                  style={{
                    marginTop: '1rem',
                    background: '#764ba2',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  View Full Leaderboard
                </button>
              </div>
            )}
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
              cursor: 'pointer',
              position: 'relative'
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
                  color: gameState.winner === 'human' ? '#27ae60' : gameState.winner === 'ai' ? '#c0392b' : '#f39c12',
                  fontWeight: 'bold'
                }}>
                  {gameState.winner === 'human' ? '👑 You Won!' : 
                   gameState.winner === 'ai' ? '🤖 AI Won!' : '🤝 Tie!'}
                </div>
              )}
            </div>

            {/* Game Messages History */}
            <div style={{
              background: '#fafafa',
              borderRadius: '8px',
              marginBottom: '2rem',
            }}>
              <h3 style={{ padding: '1rem', margin: 0, borderBottom: '1px solid #eee' }}>Game History</h3>
              <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                padding: '1rem'
              }}>
                {!gameState.messages || gameState.messages.length === 0 ? (
                  <p>No messages yet. Game is starting...</p>
                ) : (
                  <>
                    {gameState.messages.map((msg, idx) => (
                      <React.Fragment key={idx}>
                        {idx === 0 || msg.round_num !== gameState.messages[idx - 1].round_num ? (
                          <div style={{
                            marginTop: idx > 0 ? '1.5rem' : 0,
                            marginBottom: '0.5rem',
                            color: '#666',
                            fontSize: '0.9rem',
                            fontWeight: 'bold'
                          }}>
                            Round {msg.round_num}
                          </div>
                        ) : null}
                        <div style={{
                          margin: '0.5rem 0',
                          padding: '0.5rem',
                          background: msg.player === 'human' ? '#e3f5fd' : '#fff3e0',
                          borderRadius: '4px',
                          borderLeft: `4px solid ${msg.player === 'human' ? '#2196f3' : '#ff9800'}`
                        }}>
                          <strong>
                            {msg.player === 'human' ? 'You' : 'AI'}:
                          </strong>
                          {msg.role === 'proposer' && msg.proposal !== null && (
                            <span> Proposed {msg.proposal} points for you, {10 - msg.proposal} points for AI</span>
                          )}
                          {msg.role === 'decider' && msg.decision !== null && (
                            <span> {msg.decision ? 'Accepted ✅' : 'Rejected ❌'}</span>
                          )}
                          {msg.message && (
                            <div style={{ fontStyle: 'italic', marginTop: '0.25rem' }}>
                              "{msg.message}"
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
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
                      onChange={handleProposalMessageChange}
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
                      onChange={handleDecisionMessageChange}
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
                    background: '#2c3e50',
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

                {/* Leaderboard */}
                <div style={{ 
                  marginTop: '2rem',
                  background: '#f5f5f5',
                  padding: '1.5rem',
                  borderRadius: '8px'
                }}>
                  <h2>👑 Leaderboard</h2>
                  <LeaderboardControls />
                  <LeaderboardTable entries={leaderboard} maxHeight="400px" sortBy={leaderboardSort} />
                </div>
              </div>
            )}
          </>
        )}

        {/* Full Leaderboard Modal */}
        {showFullLeaderboard && (
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
              maxWidth: '800px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem'
              }}>
                <h2 style={{ margin: 0 }}>👑 Full Leaderboard</h2>
                <button
                  onClick={() => setShowFullLeaderboard(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    padding: '0.5rem'
                  }}
                >
                  ×
                </button>
              </div>
              <LeaderboardControls />
              <LeaderboardTable entries={leaderboard} maxHeight="calc(90vh - 150px)" sortBy={leaderboardSort} />
            </div>
          </div>
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
              <h2>🎉 Congratulations! You Won! 👑</h2>
              <p>Enter your name to be added to the leaderboard:</p>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyPress={handlePlayerNameKeyPress}
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
                    background: '#2c3e50',
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
