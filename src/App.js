import React, { useEffect, useState, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { io } from "socket.io-client";
import { Chess } from "chess.js";

const BACKEND = "https://chess-backend-lig8.onrender.com";
const socket = io(BACKEND, { transports: ['websocket', 'polling'] });

function secondsToMMSS(s) {
  if (s < 0) s = 0;
  const m = Math.floor(s/60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

export default function App(){
  const [connected, setConnected] = useState(false);
  const [fen, setFen] = useState("start");
  const [room, setRoom] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [color, setColor] = useState('w');
  const [status, setStatus] = useState("idle");
  const [timers, setTimers] = useState({ w: 300, b: 300 });
  const [moveHistory, setMoveHistory] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [drawOffer, setDrawOffer] = useState(false);
  const chessClientRef = useRef(new Chess());
  const [boardWidth, setBoardWidth] = useState(520);

  useEffect(() => {
    function resize(){ setBoardWidth(Math.min(520, window.innerWidth - 320)); }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Socket connected');
      setConnected(true);
    });
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });
    socket.on('startGame', ({ fen }) => {
      console.log('startGame received:', fen);
      setFen(fen);
      chessClientRef.current = new Chess(fen);
      setStatus('playing');
      setMessage('Game started');
      setMoveHistory([]);
    });
    socket.on('assignColor', ({ color }) => {
      console.log('assignColor received:', color);
      setColor(color);
    });
    socket.on('updateBoard', ({ fen, move, history }) => {
      console.log('updateBoard received:', { fen, move, history });
      setFen(fen);
      chessClientRef.current = new Chess(fen);
      if (history) setMoveHistory(history);
      if (move) setMessage(`Last move: ${move}`);
      setSelectedSquare(null);
      setLegalTargets([]);
    });
    socket.on('timerUpdate', ({ timers }) => {
      console.log('timerUpdate received:', timers);
      setTimers(timers);
    });
    socket.on('gameOver', (payload) => {
      console.log('gameOver received:', payload);
      setStatus('finished');
      const { result, winner } = payload;
      if (result === 'checkmate') {
        setMessage(`Checkmate — ${winner === color ? 'you lose' : 'you win'}`);
      } else if (result === 'draw') {
        setMessage('Game Drawn');
      } else if (result === 'resign') {
        setMessage(`Resign — ${winner === color ? 'you win' : 'you lose'}`);
      } else if (result === 'timeout') {
        setMessage(`Timeout — winner ${winner}`);
      } else {
        setMessage(`Game Over: ${result}`);
      }
      setDrawOffer(false);
    });
    socket.on('opponentLeft', () => {
      console.log('opponentLeft received');
      setMessage('Opponent left the room');
      setStatus('waiting');
      setDrawOffer(false);
    });
    socket.on('drawOffered', () => {
      console.log('drawOffered received');
      setDrawOffer(true);
      setMessage('Opponent offered a draw');
      setTimeout(() => setDrawOffer(false), 30000); // Reset after 30s if no response
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('startGame');
      socket.off('assignColor');
      socket.off('updateBoard');
      socket.off('timerUpdate');
      socket.off('gameOver');
      socket.off('opponentLeft');
      socket.off('drawOffered');
    };
  }, [color]);

  function handleCreate(){
    socket.emit('createRoom', null, ({ code, fen, color }) => {
      console.log('createRoom response:', { code, fen, color });
      setRoom(code);
      setFen(fen);
      chessClientRef.current = new Chess(fen);
      setInRoom(true);
      setStatus('waiting');
      setColor(color || 'w');
      setMessage('Room created — waiting for opponent');
    });
  }

  function handleJoin(){
    if (!room) { alert('Enter room code'); return; }
    socket.emit('joinRoom', { code: room }, (res) => {
      console.log('joinRoom response:', res);
      if (res?.error) { alert(res.error); return; }
      setInRoom(true);
      setStatus('playing');
      setMessage('Joined room — game started');
      setColor('b'); // Force black for joiner
    });
  }

  function onPieceDrop(source, target) {
    if (!inRoom) return false;
    socket.emit('move', { code: room, from: source, to: target }, (response) => {
      console.log('move response:', response);
      if (response?.error) setMessage(response.error);
    });
    return true;
  }

  function onPieceClick(square) {
    const moves = chessClientRef.current.moves({ square, verbose: true });
    const targets = moves.map(m => m.to);
    setSelectedSquare(square);
    setLegalTargets(targets);
  }

  function onSquareClick(square) {
    if (selectedSquare && legalTargets.includes(square)) {
      socket.emit('move', { code: room, from: selectedSquare, to: square }, (response) => {
        console.log('move response:', response);
        if (response?.error) setMessage(response.error);
      });
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }
    const piece = chessClientRef.current.get(square);
    const currentTurn = chessClientRef.current.turn();
    if (piece && piece.color === currentTurn && (piece.color === color || currentTurn === color)) {
      onPieceClick(square);
    } else {
      setSelectedSquare(null);
      setLegalTargets([]);
    }
  }

  function handleResign(){
    socket.emit('resign', { code: room }, () => {
      console.log('resign emitted');
      setMessage('Resigned — waiting for server');
    });
  }

  function handleOfferDraw(){
    socket.emit('offerDraw', { code: room }, () => {
      console.log('offerDraw emitted');
      setMessage('Draw offered');
    });
  }

  function handleAcceptDraw(){
    socket.emit('acceptDraw', { code: room }, () => {
      console.log('acceptDraw emitted');
      setDrawOffer(false);
    });
  }

  function handleRejectDraw(){
    socket.emit('rejectDraw', { code: room }, () => {
      console.log('rejectDraw emitted');
      setDrawOffer(false);
      setMessage('Draw offer rejected');
    });
  }

  function leaveRoom(){
    socket.emit('leave', { code: room });
    setInRoom(false);
    setRoom('');
    setStatus('idle');
    setMoveHistory([]);
    setMessage('Left room');
    setSelectedSquare(null);
    setLegalTargets([]);
    setDrawOffer(false);
  }

  const myOrientation = color === 'w' ? 'white' : 'black';
  const myTimer = color === 'w' ? timers.w : timers.b;
  const oppTimer = color === 'w' ? timers.b : timers.w;

  const customSquareStyles = {};
  if (selectedSquare) {
    customSquareStyles[selectedSquare] = { background: 'rgba(88,214,141,0.35)' };
  }
  legalTargets.forEach(sq => {
    customSquareStyles[sq] = { background: 'radial-gradient(circle at center, rgba(88,214,141,0.85) 20%, rgba(88,214,141,0.35) 60%)' };
  });

  return (
    <div className="app">
      <div className="container">
        <div className="left">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div>
              <div className="brand">Flip Chess</div>
              <div className="sub">Clean. Fast. No login — Chess960 backrank</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:12, color:'#9fb3d9'}}>Connection</div>
              <div style={{fontWeight:700, color: connected ? '#9be7a5' : '#f87171' }}>{connected ? 'Online' : 'Offline'}</div>
            </div>
          </div>

          <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:10}}>
            <div style={{flex:'0 0 80%'}}>
              <div className="info">
                <div>
                  <div style={{fontSize:12, color:'#9fb3d9'}}>Room</div>
                  <div className="room-code">{room || '—'}</div>
                </div>
                <div>
                  <div style={{fontSize:12, color:'#9fb3d9'}}>You</div>
                  <div style={{fontWeight:700}}>{color === 'w' ? 'White' : 'Black'}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:12, color:'#9fb3d9'}}>Status</div>
                  <div style={{fontWeight:700}}>{status}</div>
                </div>
              </div>
            </div>
            <div style={{flex:'0 0 20%'}}>
              <button className="btn small ghost" onClick={() => { navigator.clipboard?.writeText(window.location.href); alert('URL copied') }}>Share</button>
            </div>
          </div>

          <div style={{display:'flex', gap:20, alignItems:'flex-start', marginTop:8}}>
            <div style={{width: boardWidth}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontWeight:700}}>{color === 'w' ? 'White (You)' : 'White'}</div>
                <div className="timer">{color === 'w' ? secondsToMMSS(myTimer) : secondsToMMSS(oppTimer)}</div>
              </div>

              <div style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.15), transparent)', padding:12, borderRadius:8}}>
                <div className="chessboard-wrap">
                  <Chessboard
                    position={fen}
                    onPieceDrop={(from, to) => onPieceDrop(from, to)}
                    onPieceClick={(sq) => onPieceClick(sq)}
                    onSquareClick={(sq) => onSquareClick(sq)}
                    boardWidth={Math.min(520, boardWidth)}
                    customBoardStyle={{ boxShadow: '0 10px 30px rgba(2,6,23,0.6)', borderRadius:8 }}
                    orientation={myOrientation}
                    customSquareStyles={customSquareStyles}
                  />
                </div>
              </div>

              <div style={{display:'flex', justifyContent:'space-between', marginTop:10}}>
                <div style={{display:'flex', gap:8}}>
                  <button className="btn small" onClick={handleResign}>Resign</button>
                  <button className="btn small ghost" onClick={handleOfferDraw}>Offer Draw</button>
                  {drawOffer && (
                    <>
                      <button className="btn small" onClick={handleAcceptDraw}>Accept Draw</button>
                      <button className="btn small ghost" onClick={handleRejectDraw}>Reject Draw</button>
                    </>
                  )}
                </div>
                <div>
                  <button className="btn small ghost" onClick={leaveRoom}>Leave</button>
                </div>
              </div>
            </div>

            <div style={{flex:1}}>
              <div className="right">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div>
                    <div className="brand" style={{fontSize:16}}>Flip Chess</div>
                    <div className="small-muted">Guest rooms — Chess960</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:12, color:'#9fb3d9'}}>Timers</div>
                    <div style={{fontWeight:700}}>{secondsToMMSS(myTimer)} vs {secondsToMMSS(oppTimer)}</div>
                  </div>
                </div>

                {!inRoom ? (
                  <>
                    <div style={{display:'flex', gap:8}}>
                      <button className="btn" onClick={handleCreate}>Create Room</button>
                      <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Room code" style={{flex:1, padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', background:'transparent', color:'inherit'}}/>
                    </div>
                    <div>
                      <button className="btn ghost" onClick={handleJoin}>Join Room</button>
                    </div>
                    <div className="legend"><span className="highlight-dot"></span>Click a piece to preview moves — click a square to move</div>
                  </>
                ) : (
                  <>
                    <div className="info">
                      <div>
                        <div style={{fontSize:12,color:'#9fb3d9'}}>You</div>
                        <div style={{fontWeight:700}}>{color === 'w' ? 'White' : 'Black'}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:12,color:'#9fb3d9'}}>Status</div>
                        <div style={{fontWeight:700}}>{status}</div>
                      </div>
                    </div>

                    <div style={{marginTop:6}}>
                      <div style={{fontSize:13, color:'#9fb3d9'}}>Moves</div>
                      <div className="moves">
                        {moveHistory.length === 0 ? <div style={{color:'#7b8aa0'}}>No moves yet</div> : (
                          <ol>
                            {moveHistory.map((m, idx) => <li key={idx}>{idx+1}. {m}</li>)}
                          </ol>
                        )}
                      </div>
                    </div>
                    <div style={{marginTop:6}}>
                      <div style={{fontSize:13, color:'#9fb3d9'}}>Messages</div>
                      <div style={{background:'rgba(255,255,255,0.02)', padding:8, borderRadius:8}}>{message || '—'}</div>
                    </div>
                  </>
                )}

                <div style={{marginTop:8, fontSize:13, color:'#9fb3d9'}}>Made quickly — Ads-ready slots available</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
