# peer2peer-webRTC-app
# WebRTC Peer-to-Peer Video Chat Application

A real-time peer-to-peer video chat application built with WebRTC, Socket.IO, and Express.js.

## Features

- 🎥 Real-time video and audio communication
- 💬 Text chat functionality
- 🔇 Audio and video controls
- 📱 Responsive design for mobile devices
- 👥 User presence and status
- 🔄 Automatic connection handling

## Prerequisites

Before you begin, ensure you have installed:
- [Node.js](https://nodejs.org/) (v14.0.0 or higher)
- npm (usually comes with Node.js)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/peer2peer-webrtc-app.git
   cd peer2peer-webrtc-app
   ```

2. Install dependencies (choose one method):
   ```bash
   # Method 1: Using npm (standard)
   npm install
   
   # Method 2: If npm has issues, use the start script
   ./start.sh
   
   # Method 3: Manual installation of dependencies
   node -e "require('child_process').execSync('npm install express socket.io', {stdio: 'inherit'})"
   ```

## Running the Application

Choose one of the following methods:

1. Using npm:
   ```bash
   npm start
   ```

2. Using Node directly:
   ```bash
   node server.js
   ```

3. Using the start script (recommended if experiencing issues):
   ```bash
   ./start.sh
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Troubleshooting Startup Issues

If you encounter the error `ENOENT: no such file or directory, uv_cwd` or other npm-related issues:

1. Try using the start script:
   ```bash
   ./start.sh
   ```

2. Use the direct installation script (most reliable):
   ```bash
   node direct-install.js
   node server.js
   ```

3. If that doesn't work, install dependencies manually:
   ```bash
   node -e "require('child_process').execSync('npm install express socket.io', {stdio: 'inherit'})"
   node server.js
   ```

4. If you're using nvm, try:
   ```bash
   # Resets the nvm environment
   cd && cd - && nvm use node
   cd path/to/peer2peer-webrtc-app
   npm install
   ```

## Usage

1. Allow camera and microphone access when prompted
2. Click "Start Camera" to initialize your video
3. Wait for other users to connect
4. Select a user from the sidebar to start a call
5. Use the media controls to:
   - Toggle audio (🎤)
   - Toggle video (📹)
   - End call (Hang Up button)
6. Use the chat feature to send text messages during the call

## Technical Details

### Architecture

- Frontend: HTML5, CSS3, JavaScript (Vanilla)
- Backend: Node.js, Express.js
- Real-time Communication: WebRTC, Socket.IO
- STUN Server: Google's public STUN server

### WebRTC Flow

1. Signaling server establishes initial connection
2. Peer connection is created with ICE candidates
3. Offer/Answer exchange establishes media connection
4. Direct peer-to-peer connection is established
5. Media streams are exchanged directly between peers

## Security Considerations

- Uses HTTPS in production (required for WebRTC)
- Implements proper media stream cleanup
- Handles disconnections gracefully
- Validates all incoming messages

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge (Chromium-based)

## Development

### Project Structure

```
peer2peer-webrtc-app/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server.js
├── package.json
└── README.md
```

### Adding Features

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Troubleshooting

### Common Issues

1. Camera/Microphone Access:
   - Ensure you've granted browser permissions
   - Check if another application is using the devices

2. Connection Issues:
   - Check your internet connection
   - Ensure your firewall isn't blocking WebRTC
   - Try using a different browser

3. Audio/Video Quality:
   - Check your internet bandwidth
   - Close other applications using camera/microphone
   - Try refreshing the page

## License

MIT License - feel free to use this project for any purpose.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 
