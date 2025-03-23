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
const screenShareButton = document.getElementById('screenShareButton');
const connectionStatusElement = document.getElementById('connectionStatus');
const testConnectionButton = document.getElementById('testConnection');
const fileInput = document.getElementById('fileInput');
const fileStatus = document.getElementById('fileStatus');

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
let screenShareStream = null;
let isScreenSharing = false;
let dataChannel = null;
let fileChunks = [];
let currentFile = null;
let receivedFileSize = 0;
let fileTransferInProgress = false;

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
        screenShareButton.disabled = false;
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

    // Create data channel for file transfer and chat
    dataChannel = peerConnection.createDataChannel('fileTransfer', {
        ordered: true
    });
    
    setupDataChannel(dataChannel);
    
    // Handle remote data channel
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        setupDataChannel(dataChannel);
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

// Setup the data channel for handling file transfers and messages
function setupDataChannel(channel) {
    channel.onopen = () => {
        console.log('Data channel is open');
    };
    
    channel.onclose = () => {
        console.log('Data channel is closed');
    };
    
    channel.onerror = (error) => {
        console.error('Data channel error:', error);
    };
    
    channel.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'chat') {
            handleChatMessage({
                from: data.from,
                message: data.message
            });
        } else if (data.type === 'file-info') {
            // Prepare to receive file
            fileChunks = [];
            receivedFileSize = 0;
            currentFile = {
                name: data.name,
                size: data.size,
                type: data.fileType
            };
            fileStatus.textContent = `Receiving file: ${data.name} (0%)`;
        } else if (data.type === 'file-chunk') {
            // Convert base64 to blob and add to chunks
            const base64Data = data.chunk;
            const binary = atob(base64Data);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
            }
            
            // Add to chunks and update progress
            fileChunks.push(array);
            receivedFileSize += array.length;
            
            // Update progress
            const progress = Math.floor((receivedFileSize / currentFile.size) * 100);
            fileStatus.textContent = `Receiving file: ${currentFile.name} (${progress}%)`;
        } else if (data.type === 'file-complete') {
            // Combine chunks and create download link
            const blob = new Blob(fileChunks, { type: currentFile.type });
            displayFileMessage(currentFile.name, currentFile.size, blob, false);
            
            fileStatus.textContent = 'File received successfully';
            fileChunks = [];
            currentFile = null;
            receivedFileSize = 0;
        }
    };
}

// Handle sending a file
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
        alert('Unable to transfer file. No active connection.');
        return;
    }
    
    if (fileTransferInProgress) {
        alert('Please wait for the current file transfer to complete.');
        return;
    }
    
    fileTransferInProgress = true;
    fileStatus.textContent = `Sending file: ${file.name} (0%)`;
    
    // Send file info
    dataChannel.send(JSON.stringify({
        type: 'file-info',
        name: file.name,
        size: file.size,
        fileType: file.type,
        from: currentUserId
    }));
    
    // Read and send the file in chunks
    const chunkSize = 16384; // 16KB chunks
    const reader = new FileReader();
    let offset = 0;
    
    reader.onload = (e) => {
        const data = e.target.result;
        // Send the data as a base64 string
        dataChannel.send(JSON.stringify({
            type: 'file-chunk',
            chunk: btoa(String.fromCharCode.apply(null, new Uint8Array(data)))
        }));
        
        offset += data.byteLength;
        const progress = Math.floor((offset / file.size) * 100);
        fileStatus.textContent = `Sending file: ${file.name} (${progress}%)`;
        
        if (offset < file.size) {
            // Read the next chunk
            readSlice(offset);
        } else {
            // File transfer complete
            dataChannel.send(JSON.stringify({
                type: 'file-complete'
            }));
            fileStatus.textContent = 'File sent successfully';
            fileTransferInProgress = false;
            
            // Create a local display of the sent file
            displayFileMessage(file.name, file.size, file, true);
        }
    };
    
    reader.onerror = (error) => {
        console.error('Error reading file:', error);
        fileStatus.textContent = 'Error sending file';
        fileTransferInProgress = false;
    };
    
    function readSlice(offset) {
        const slice = file.slice(offset, offset + chunkSize);
        reader.readAsArrayBuffer(slice);
    }
    
    readSlice(0);
}

// Display file message in chat
function displayFileMessage(fileName, fileSize, fileData, isSent) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('file-message');
    messageElement.classList.add(isSent ? 'sent' : 'received');
    
    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };
    
    messageElement.innerHTML = `
        <div class="file-icon">📄</div>
        <div class="file-info">
            <div class="file-name">${fileName}</div>
            <div class="file-size">${formatFileSize(fileSize)}</div>
        </div>
    `;
    
    // Add download button for received files
    if (!isSent) {
        const downloadButton = document.createElement('button');
        downloadButton.classList.add('file-download');
        downloadButton.textContent = 'Download';
        downloadButton.onclick = () => {
            const url = URL.createObjectURL(fileData);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
        messageElement.appendChild(downloadButton);
    }
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
        // If data channel is open, send directly through it
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify({
                type: 'chat',
                message: message,
                from: currentUserId
            }));
            
            // Display the sent message locally
            handleChatMessage({
                from: currentUserId,
                message: message
            });
        } else {
            // Fall back to signaling server for message relay
            socket.emit('chat-message', {
                target: selectedUserId,
                from: currentUserId,
                message: message
            });
        }
        
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

// Toggle screen sharing
async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            screenShareStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            });
            
            // Store current video track to restore later
            const videoTrack = localStream.getVideoTracks()[0];
            const screenTrack = screenShareStream.getVideoTracks()[0];
            
            // If in active call, replace the track in the peer connection
            if (peerConnection) {
                const senders = peerConnection.getSenders();
                const videoSender = senders.find(sender => 
                    sender.track.kind === 'video'
                );
                if (videoSender) {
                    videoSender.replaceTrack(screenTrack);
                }
            }
            
            // Replace video track in the local stream
            localStream.removeTrack(videoTrack);
            localStream.addTrack(screenTrack);
            
            // Update local video display
            localVideo.srcObject = localStream;
            
            // Listen for the screen share ending
            screenTrack.onended = () => {
                toggleScreenShare();
            };
            
            isScreenSharing = true;
            screenShareButton.textContent = '📹';
            screenShareButton.classList.add('active');
            
        } catch (error) {
            console.error('Error sharing screen:', error);
            alert('Error sharing screen. Please ensure you have granted the necessary permissions.');
        }
    } else {
        // Stop screen sharing and revert to camera
        if (screenShareStream) {
            screenShareStream.getTracks().forEach(track => track.stop());
            screenShareStream = null;
        }
        
        try {
            // Get a new video track from the camera
            const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const cameraTrack = newStream.getVideoTracks()[0];
            
            // If in active call, replace the track in the peer connection
            if (peerConnection) {
                const senders = peerConnection.getSenders();
                const videoSender = senders.find(sender => 
                    sender.track.kind === 'video'
                );
                if (videoSender) {
                    videoSender.replaceTrack(cameraTrack);
                }
            }
            
            // Replace screen share track with camera track
            const oldTrack = localStream.getVideoTracks()[0];
            if (oldTrack) {
                localStream.removeTrack(oldTrack);
                oldTrack.stop();
            }
            localStream.addTrack(cameraTrack);
            
            // Update local video display
            localVideo.srcObject = localStream;
            
            isScreenSharing = false;
            screenShareButton.textContent = '🖥️';
            screenShareButton.classList.remove('active');
            
        } catch (error) {
            console.error('Error reverting to camera:', error);
            alert('Error reverting to camera. Please refresh the page.');
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
screenShareButton.addEventListener('click', toggleScreenShare);
fileInput.addEventListener('change', handleFileSelect);
if (testConnectionButton) {
    testConnectionButton.addEventListener('click', testConnection);
}

// Initialize the application
initializeSocket(); 