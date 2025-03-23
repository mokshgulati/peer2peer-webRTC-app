const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

// Load environment variables if .env exists
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        console.log('Loading environment from .env file');
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            // Skip comments and empty lines
            if (line.trim() && !line.startsWith('#')) {
                const [key, value] = line.split('=');
                if (key && value) {
                    process.env[key.trim()] = value.trim();
                }
            }
        });
    }
} catch (error) {
    console.log('No .env file found or error reading it. Using default configuration.');
}

// Serve static files from the public directory
app.use(express.static('public'));

// Store connected users
const users = new Map();

io.on('connection', (socket) => {
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
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 