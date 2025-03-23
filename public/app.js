// DOM Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const userIdDisplay = document.getElementById('userId');
const usersList = document.getElementById('usersList');
const messageInput = document.getElementById('messageInput');
const sendMessageButton = document.getElementById('sendMessage');
const chatMessages = document.getElementById('chatMessages');
const toggleAudioButton = document.getElementById('toggleAudio');
const toggleVideoButton = document.getElementById('toggleVideo');
const connectionStatusElement = document.getElementById('connectionStatus');
const testConnectionButton = document.getElementById('testConnection');

// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: window.STUN_SERVER || 'stun:stun.l.google.com:19302' }
    ]
};

// State
let localStream = null;
let peerConnection = null;
let socket = null;
let currentUserId = null;
let selectedUserId = null;
let isAudioEnabled = true;
let isVideoEnabled = true;

// Generate a random user ID
function generateUserId() {
    return Math.random().toString(36).substring(2, 15);
}

// Initialize Socket.IO connection
function initializeSocket() {
    socket = io();
    currentUserId = generateUserId();
    userIdDisplay.textContent = currentUserId;
    socket.emit('join', currentUserId);

    // Handle incoming users list
    socket.on('userList', (users) => {
        updateUsersList(users);
    });

    // Handle incoming WebRTC signals
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);

    // Handle incoming chat messages
    socket.on('chat-message', handleChatMessage);
}

// Update the users list in the UI
function updateUsersList(users) {
    usersList.innerHTML = '';
    users.forEach(userId => {
        if (userId !== currentUserId) {
            const li = document.createElement('li');
            li.textContent = userId;
            li.onclick = () => selectUser(userId);
            usersList.appendChild(li);
        }
    });
}

// Select a user to call
function selectUser(userId) {
    selectedUserId = userId;
    document.querySelectorAll('#usersList li').forEach(li => {
        li.classList.remove('selected');
        if (li.textContent === userId) {
            li.classList.add('selected');
        }
    });
    callButton.disabled = false;
}

// Start local video stream
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        startButton.disabled = true;
        toggleAudioButton.disabled = false;
        toggleVideoButton.disabled = false;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Error accessing camera and microphone. Please ensure you have granted the necessary permissions.');
    }
}

// Create and configure peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle incoming remote stream
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                target: selectedUserId,
                from: currentUserId,
                candidate: event.candidate
            });
        }
    };

    // Log connection state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', peerConnection.iceConnectionState);
        updateConnectionStatus(peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'connected' || peerConnection.iceConnectionState === 'completed') {
            console.log('Peers successfully connected!');
        } else if (peerConnection.iceConnectionState === 'failed' || peerConnection.iceConnectionState === 'disconnected') {
            console.log('Peer connection failed or disconnected');
        }
    };

    return peerConnection;
}

// Handle incoming offer
async function handleOffer(data) {
    if (!localStream) {
        alert('You need to start your camera before accepting calls.');
        return;
    }
    
    // If we don't have a peer connection yet, create one
    if (!peerConnection) {
        peerConnection = createPeerConnection();
    }
    
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    socket.emit('answer', {
        target: data.from,
        from: currentUserId,
        answer: answer
    });
    
    // Update UI when receiving a call
    selectedUserId = data.from;
    callButton.disabled = true;
    hangupButton.disabled = false;
    testConnectionButton.disabled = false;
}

// Handle incoming answer
async function handleAnswer(data) {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
}

// Handle incoming ICE candidate
async function handleIceCandidate(data) {
    if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
}

// Handle chat messages
function handleChatMessage(data) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(data.from === currentUserId ? 'sent' : 'received');
    messageElement.textContent = data.message;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send chat message
function sendMessage() {
    const message = messageInput.value.trim();
    if (message && selectedUserId) {
        socket.emit('chat-message', {
            target: selectedUserId,
            from: currentUserId,
            message: message
        });
        messageInput.value = '';
    }
}

// Toggle audio
function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isAudioEnabled = audioTrack.enabled;
            toggleAudioButton.textContent = isAudioEnabled ? '🎤' : '🔇';
            toggleAudioButton.classList.toggle('muted', !isAudioEnabled);
        }
    }
}

// Toggle video
function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isVideoEnabled = videoTrack.enabled;
            toggleVideoButton.textContent = isVideoEnabled ? '📹' : '🚫';
            toggleVideoButton.classList.toggle('muted', !isVideoEnabled);
        }
    }
}

// Start a call
async function startCall() {
    if (!selectedUserId || !localStream) return;

    peerConnection = createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit('offer', {
        target: selectedUserId,
        from: currentUserId,
        offer: offer
    });

    callButton.disabled = true;
    hangupButton.disabled = false;
    testConnectionButton.disabled = false;
}

// End the call
function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    callButton.disabled = false;
    hangupButton.disabled = true;
    testConnectionButton.disabled = true;
    updateConnectionStatus('Not connected');
}

// Update connection status in the UI
function updateConnectionStatus(state) {
    connectionStatusElement.textContent = state;
    connectionStatusElement.className = '';
    connectionStatusElement.classList.add(state);
}

// Test WebRTC connectivity between peers
function testConnection() {
    if (!peerConnection) {
        alert('No active peer connection to test.');
        return;
    }
    
    // Log ICE connection state
    console.log('Current ICE Connection State:', peerConnection.iceConnectionState);
    
    // Check for connected ICE candidates
    const iceTransports = peerConnection.getTransceivers()
        .map(t => t.sender.transport)
        .filter(t => t !== null);
    
    console.log('Active ICE transports:', iceTransports.length);
    
    // Log statistics to diagnose issues
    peerConnection.getStats(null).then(stats => {
        let iceCandidatePairs = [];
        let localCandidates = [];
        let remoteCandidates = [];
        
        stats.forEach(report => {
            if (report.type === 'candidate-pair') {
                iceCandidatePairs.push(report);
            }
            
            if (report.type === 'local-candidate') {
                localCandidates.push(report);
            }
            
            if (report.type === 'remote-candidate') {
                remoteCandidates.push(report);
            }
        });
        
        console.log('ICE Candidate Pairs:', iceCandidatePairs);
        console.log('Local Candidates:', localCandidates);
        console.log('Remote Candidates:', remoteCandidates);
        
        // Find the active candidate pair
        const activePair = iceCandidatePairs.find(pair => pair.state === 'succeeded');
        
        if (activePair) {
            alert('WebRTC connection is active and working properly.');
            console.log('Active Candidate Pair:', activePair);
        } else {
            alert('WebRTC connection test failed. Check console for details.');
        }
    });
}

// Event Listeners
startButton.addEventListener('click', startLocalStream);
callButton.addEventListener('click', startCall);
hangupButton.addEventListener('click', endCall);
sendMessageButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
toggleAudioButton.addEventListener('click', toggleAudio);
toggleVideoButton.addEventListener('click', toggleVideo);
if (testConnectionButton) {
    testConnectionButton.addEventListener('click', testConnection);
}

// Initialize the application
initializeSocket(); 