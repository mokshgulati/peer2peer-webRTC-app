const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');
const compression = require('compression');

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

// Simple in-memory rate limiting
const rateLimiter = {
    clients: new Map(),
    maxRequestsPerMinute: 100,
    
    limitRequest(clientId) {
        const now = Date.now();
        const windowMs = 60 * 1000; // 1 minute
        
        if (!this.clients.has(clientId)) {
            this.clients.set(clientId, {
                count: 1,
                resetTime: now + windowMs
            });
            return false; // Not limited
        }
        
        const client = this.clients.get(clientId);
        
        // Reset if time window has passed
        if (now > client.resetTime) {
            client.count = 1;
            client.resetTime = now + windowMs;
            return false; // Not limited
        }
        
        // Increment request count
        client.count++;
        
        // Check if limit exceeded
        return client.count > this.maxRequestsPerMinute;
    },
    
    // Cleanup expired entries periodically
    cleanup() {
        const now = Date.now();
        for (const [clientId, client] of this.clients.entries()) {
            if (now > client.resetTime) {
                this.clients.delete(clientId);
            }
        }
    }
};

// Set cleanup interval (every 5 minutes)
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

// Use compression middleware - properly handles header issues
app.use(compression({
    // Don't compress responses with this request header
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        
        // Skip compression for media files
        if (req.url.match(/\.(jpg|jpeg|png|gif|mp4|webm|ogg)$/)) {
            return false;
        }
        
        return compression.filter(req, res);
    },
    // Compression level (0-9)
    level: 6
}));

// Serve static files from the public directory
app.use(express.static('public', {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0, // Cache for 1 day in production
}));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Store connected users
const users = new Map();
const userConnectionTimes = new Map();
const userLastActivity = new Map();

// Check for inactive users every 5 minutes
setInterval(() => {
    const now = Date.now();
    const inactivityThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [userId, lastActivity] of userLastActivity.entries()) {
        if (now - lastActivity > inactivityThreshold) {
            const socketId = users.get(userId);
            if (socketId) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    console.log(`Disconnecting inactive user: ${userId}`);
                    socket.disconnect(true);
                }
                users.delete(userId);
                userConnectionTimes.delete(userId);
                userLastActivity.delete(userId);
            }
        }
    }
}, 5 * 60 * 1000);

io.on('connection', (socket) => {
    console.log('A user connected');
    
    // Update activity on connection
    socket.lastActivity = Date.now();
    
    // Track socket errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });

    // Handle user joining
    socket.on('join', (userId) => {
        // Apply rate limiting
        const clientIp = socket.handshake.address;
        if (rateLimiter.limitRequest(clientIp)) {
            console.log(`Rate limit exceeded for client: ${clientIp}`);
            socket.emit('error', 'Too many requests, please try again later');
            return;
        }
        
        users.set(userId, socket.id);
        userConnectionTimes.set(userId, Date.now());
        userLastActivity.set(userId, Date.now());
        
        io.emit('userList', Array.from(users.keys()));
    });

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        // Update activity timestamp
        userLastActivity.set(data.from, Date.now());
        
        const targetSocket = users.get(data.target);
        if (targetSocket) {
            io.to(targetSocket).emit('offer', {
                offer: data.offer,
                from: data.from
            });
        }
    });

    socket.on('answer', (data) => {
        // Update activity timestamp
        userLastActivity.set(data.from, Date.now());
        
        const targetSocket = users.get(data.target);
        if (targetSocket) {
            io.to(targetSocket).emit('answer', {
                answer: data.answer,
                from: data.from
            });
        }
    });

    socket.on('ice-candidate', (data) => {
        // Update activity timestamp
        userLastActivity.set(data.from, Date.now());
        
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
        // Update activity timestamp
        userLastActivity.set(data.from, Date.now());
        
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
            userConnectionTimes.delete(userId);
            userLastActivity.delete(userId);
            io.emit('userList', Array.from(users.keys()));
        }
        console.log('User disconnected');
    });
});

// Error handling for server
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // In a production environment, you would log this to a file or service
    // and potentially restart the server gracefully
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the application at http://localhost:${PORT}`);
}); 