const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Netlify-Function'],
  credentials: true
}));

// Store connected users (this is just for the API response, as state won't persist between function calls)
const users = [];

// Create simple HTTP responses for various endpoints
app.get('/', (req, res) => {
  res.json({ message: 'Socket.IO server endpoint' });
});

app.get('/socket.io/', (req, res) => {
  res.json({ message: 'Socket.IO polling endpoint' });
});

app.post('/socket.io/', (req, res) => {
  // Handle Socket.IO polling requests
  console.log('Socket.IO POST request received');
  res.json({ message: 'Message received' });
});

// Handle user status API
app.get('/users', (req, res) => {
  // For demo mode, return a few sample users
  const demoUsers = [
    'demo-user-1',
    'demo-user-2',
    'demo-user-3'
  ];
  res.json({ users: demoUsers });
});

app.post('/signal', (req, res) => {
  // This endpoint would be used for WebRTC signaling
  const body = req.body || {};
  console.log('Signal received:', body.type);
  res.json({ success: true });
});

// Setup serverless function
const handler = serverless(app);

// Export the handler function
exports.handler = async (event, context) => {
  // Add CORS headers to all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Netlify-Function',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  // Handle OPTIONS requests (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  // For WebSocket requests
  if (event.headers && 
      (event.headers['Upgrade'] === 'websocket' || 
       event.headers['upgrade'] === 'websocket')) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "WebSocket connection established" })
    };
  }
  
  // Handle the request with our Express app
  const response = await handler(event, context);
  
  // Add CORS headers to the response
  Object.assign(response.headers || {}, headers);
  
  return response;
};

// For local development, handle Socket.io setup
if (!process.env.NETLIFY) {
  const server = require('http').createServer(app);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', socket => {
    console.log('A user connected');
    
    // Handle user joining
    socket.on('join', (userId) => {
      users.set(userId, socket.id);
      io.emit('userList', Array.from(users.keys()));
    });

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
      const targetSocket = users.get(data.target);
      if (targetSocket) {
        io.to(targetSocket).emit('offer', {
          offer: data.offer,
          from: data.from
        });
      }
    });

    socket.on('answer', (data) => {
      const targetSocket = users.get(data.target);
      if (targetSocket) {
        io.to(targetSocket).emit('answer', {
          answer: data.answer,
          from: data.from
        });
      }
    });

    socket.on('ice-candidate', (data) => {
      const targetSocket = users.get(data.target);
      if (targetSocket) {
        io.to(targetSocket).emit('ice-candidate', {
          candidate: data.candidate,
          from: data.from
        });
      }
    });

    // Handle chat messages
    socket.on('chat-message', (data) => {
      const targetSocket = users.get(data.target);
      if (targetSocket) {
        io.to(targetSocket).emit('chat-message', {
          message: data.message,
          from: data.from,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      let userId;
      for (const [key, value] of users.entries()) {
        if (value === socket.id) {
          userId = key;
          break;
        }
      }
      if (userId) {
        users.delete(userId);
        io.emit('userList', Array.from(users.keys()));
      }
      console.log('User disconnected');
    });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
} 