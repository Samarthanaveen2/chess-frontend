import React, { useEffect, useState, useRef } from "react";
import { Chessboard } from "react-chessboard";
import { io } from "socket.io-client";

// 🔴 Set this to your render backend URL (your working backend)
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
  const [color, setColor] = useState('w'); // my color
  const [status, setStatus] = useState("idle"); // idle, waiting, playing, finished
  const [timers, setTimers] = useState({ w: 300, b: 300 });
  const [moveHistory, setMoveHistory] = useState([]);
  const [message, setMessage] = useState("");
  const chessboardRef = useRef();

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', ()=> setConnected(false));

    socket.on('startGame', ({ fen }) => {
      setFen(fen);
      setStatus('playing');
      setMessage('Game started');
    });
    socket.on('assignColor', ({ color }) => {
      setColor(color);
    });
    socket.on('updateBoard', ({ fen, move, history }) => {
      setFen(fen);
      if (move) {
        setMoveHistory(history || (prev => [...prev, move]));
      }
    });
    socket.on('timerUpdate', ({ timers }) => {
      setTimers(timers);
    });
    socket.on('gameOver', (payload) => {
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
    });
    socket.on('opponentLeft', () => {
      setMessage('Opponent left the room');
      setStatus('waiting');
    });

    return () => {
      socket.off('connect'); socket.off('disconnect');
      socket.off('startGame'); socket.off('assignColor');
      socket.off('updateBoard'); socket.off('timerUpdate'); socket.off('gameOver'); socket.off('opponentLeft');
    };
  }, [color]);

  // Create room
  function handleCreate(){
    socket.emit('createRoom', null, ({ code, fen, color }) => {
      setRoom(code);
      setFen(fen);
      setInRoom(true);
      setStatus('waiting');
      setColor(color || 'w');
      setMessage('Room created — waiting for opponent');
    });
  }

  function handleJoin(){
    if (!room) { alert('Enter room code'); return; }
    socket.emit('joinRoom', { code: room }, (res) => {
      if (res?.error) { alert(res.error); return; }
      setInRoom(true);
      setStatus('playing');
      setMessage('Joined room — game started');
    });
  }

  // onDrop handler (react-chessboard): return true only if move allowed locally (we will let server validate)
  function onDrop(source, target) {
    if (!inRoom) return false;
    // send move to server; server will validate and broadcast
    socket.emit('move', { code: room, from: source, to: target }, (response) => {
      if (response?.error) {
        // illegal or not your turn
        setMessage(response.error);
      } else {
        // optimistic UI handled by server's updateBoard event
      }
    });
    // optimistic UI: don't change here; server will send updateBoard
    return true;
  }

  function handleResign(){
    socket.emit('resign', { code: room });
  }

  function handleOfferDraw(){
    socket.emit('offerDraw', { code: room });
  }

  function leaveRoom(){
    socket.emit('leave', { code: room });
    setInRoom(false);
    setRoom('');
    setStatus('idle');
    setMoveHistory([]);
    setMessage('Left room');
  }

  const myOrientation = color === 'w' ? 'white' : 'black';
  const myTimer = color === 'w' ? timers.w : timers.b;
  const oppTimer = color === 'w' ? timers.b : timers.w;

  return (
    <div className="app">
      <div className="container">
        <div className="left">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div>
              <div style={{fontSize:18, fontWeight:700}}>RandomChess</div>
              <div style={{color:'#9fb3d9', fontSize:13}}>No login — guest rooms — Chess960 backrank</div>
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

          <div style={{display:'flex', gap:20, alignItems:'flex-start'}}>
            <div style={{width: 480}}>
              <div style={{display:'flex', justifyContent:'space-between', marginBottom:8}}>
                <div style={{fontWeight:700}}>{color === 'w' ? 'White (You)' : 'White'}</div>
                <div className="timer">{color === 'w' ? secondsToMMSS(myTimer) : secondsToMMSS(oppTimer)}</div>
              </div>

              <div style={{background:'#0b1220', padding:12, borderRadius:8}}>
                <Chessboard
                  position={fen}
                  onPieceDrop={(from, to) => onDrop(from, to)}
                  boardWidth={480}
                  customBoardStyle={{ boxShadow: '0 6px 18px rgba(2,6,23,0.6)' }}
                  orientation={myOrientation}
                />
              </div>

              <div style={{display:'flex', justifyContent:'space-between', marginTop:10}}>
                <div style={{display:'flex', gap:8}}>
                  <button className="btn small" onClick={handleResign}>Resign</button>
                  <button className="btn small ghost" onClick={handleOfferDraw}>Offer Draw</button>
                </div>
                <div>
                  <button className="btn small ghost" onClick={leaveRoom}>Leave</button>
                </div>
              </div>
            </div>

            <div style={{flex:1}}>
              <div className="right">
                <div style={{fontWeight:700}}>Controls</div>

                {!inRoom ? (
                  <>
                    <div style={{display:'flex', gap:8}}>
                      <button className="btn" onClick={handleCreate}>Create Room</button>
                      <input value={room} onChange={e => setRoom(e.target.value)} placeholder="Room code" style={{flex:1, padding:8, borderRadius:8, border:'1px solid rgba(255,255,255,0.04)', background:'transparent', color:'inherit'}}/>
                    </div>
                    <div>
                      <button className="btn ghost" onClick={handleJoin}>Join Room</button>
                    </div>
                    <div style={{color:'#9fb3d9', fontSize:13}}>Tip: create room then open link in another tab and join using the code.</div>
                  </>
                ) : (
                  <>
                    <div className="info">
                      <div>
                        <div style={{fontSize:12,color:'#9fb3d9'}}>You</div>
                        <div style={{fontWeight:700}}>{color === 'w' ? 'White' : 'Black'}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:12,color:'#9fb3d9'}}>Timers</div>
                        <div style={{fontWeight:700}}>{secondsToMMSS(myTimer)} vs {secondsToMMSS(oppTimer)}</div>
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

        {/* right column thin / reserved */}
      </div>
    </div>
  );
}
