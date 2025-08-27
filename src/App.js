import React, { useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import io from "socket.io-client";

// 🔴 change this to your backend URL
const backendURL = "https://chess-backend-lig8.onrender.com";
const socket = io(backendURL);

function App() {
  const [fen, setFen] = useState("start");
  const [roomCode, setRoomCode] = useState("");
  const [inRoom, setInRoom] = useState(false);

  useEffect(() => {
    socket.on("startGame", ({ fen }) => setFen(fen));
    socket.on("updateBoard", ({ fen }) => setFen(fen));
    socket.on("gameOver", ({ result }) => alert(`Game Over: ${result}`));

    return () => {
      socket.off("startGame");
      socket.off("updateBoard");
      socket.off("gameOver");
    };
  }, []);

  const createRoom = () => {
    socket.emit("createRoom", ({ code, fen }) => {
      setRoomCode(code);
      setFen(fen);
      setInRoom(true);
    });
  };

  const joinRoom = () => {
    socket.emit("joinRoom", { code: roomCode }, ({ fen, error }) => {
      if (error) return alert(error);
      setFen(fen);
      setInRoom(true);
    });
  };

  const onDrop = (source, target) => {
    socket.emit("move", { code: roomCode, from: source, to: target });
    return true;
  };

  return (
    <div style={{ background: "#111", color: "white", minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      {!inRoom ? (
        <div>
          <button onClick={createRoom} style={{ margin: "10px", padding: "10px", background: "green", borderRadius: "8px" }}>
            Create Room
          </button>
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            placeholder="Enter Room Code"
            style={{ margin: "10px", padding: "8px" }}
          />
          <button onClick={joinRoom} style={{ margin: "10px", padding: "10px", background: "blue", borderRadius: "8px" }}>
            Join Room
          </button>
        </div>
      ) : (
        <div>
          <h2>Room Code: {roomCode}</h2>
          <Chessboard position={fen} onPieceDrop={onDrop} />
          <div>
            <button onClick={() => socket.emit("resign", { code: roomCode })} style={{ margin: "10px", padding: "10px", background: "red", borderRadius: "8px" }}>
              Resign
            </button>
            <button onClick={() => socket.emit("draw", { code: roomCode })} style={{ margin: "10px", padding: "10px", background: "yellow", borderRadius: "8px" }}>
              Offer Draw
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
