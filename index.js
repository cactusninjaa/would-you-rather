import express from 'express';
import bodyParser from 'body-parser';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from "socket.io";
import dotenv from "dotenv"

dotenv.config();

const app = express();
app.use(bodyParser.json())

const server = createServer(app);
const io = new Server(server);

const __dirname = dirname(fileURLToPath(import.meta.url));

let roomList = []

const gameState = {};

app.use(express.static(__dirname));

app.get('/questions', async (req, res) => {
  const url = 'https://would-you-rather.p.rapidapi.com/wyr/random';
  const options = {
    method: 'GET',
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'would-you-rather.p.rapidapi.com'
    }
  };

  try {
    const response = await fetch(url, options);
    const result = await response.json();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
});

app.get('/rooms', (req, res) => {
  res.send(roomList)
})

io.on('connection', (socket) => {
  socket.on('create-room', (roomName, callback) => {
    if (!roomList.includes(roomName)){
      socket.join(roomName);
      io.emit('create-room', roomName)
      roomList.push(roomName)
      callback({ success: true, message: 'Created room', room: roomName });
    } else {
      callback({ success: false, message: 'Room already exists', room: roomName });
    }
  })

  socket.on('join-room', (roomName, callback) => {
    if (roomList.includes(roomName)) {
      socket.join(roomName);
      io.emit('join-room', roomName);

      // 👇 Si une partie est déjà en cours dans cette room
      if (gameState[roomName]) {
        socket.emit('question', {
          question: gameState[roomName].question,
          scores: gameState[roomName].scores
        });
      }

      callback({ success: true, message: 'Joined room', room: roomName });
    } else {
      callback({ success: false, message: 'Non existing room', room: roomName });
    }
  });

  socket.on('send-question', (poll, roomName, callback) => {
    if (!roomName || !roomList.includes(roomName)) {
      return callback({ success: false, message: 'Non existing room', room: roomName });
    }

    gameState[roomName] = {
      question: poll[0].question,
      scores: { choice1: 0, choice2: 0 }
    };

    io.to(roomName).emit('question', {
      question: gameState[roomName].question,
      scores: gameState[roomName].scores
    });

    callback({ success: true, message: 'Question sent', room: roomName });
  });

  socket.on('vote', (roomName, choice) => {
    if (!gameState[roomName]) return;

    if (choice === 'choice1') gameState[roomName].scores.choice1++;
    if (choice === 'choice2') gameState[roomName].scores.choice2++;

    io.to(roomName).emit('update-scores', gameState[roomName].scores);
  });
});

server.listen(3000, () => {
  console.log('server running at http://localhost:3000');
});
