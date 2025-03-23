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
const recordButton = document.getElementById('recordButton');
const whiteboardButton = document.getElementById('whiteboardButton');
const whiteboardContainer = document.querySelector('.whiteboard-container');
const whiteboard = document.getElementById('whiteboard');
const penTool = document.getElementById('penTool');
const eraserTool = document.getElementById('eraserTool');
const colorPicker = document.getElementById('colorPicker');
const penSize = document.getElementById('penSize');
const clearWhiteboard = document.getElementById('clearWhiteboard');
const closeWhiteboard = document.getElementById('closeWhiteboard');
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
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let isWhiteboardVisible = false;
let isDrawing = false;
let currentTool = 'pen';
let whiteboardCtx = null;
let lastX = 0;
let lastY = 0;
let throttleTimer = null;

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
        recordButton.disabled = false;
        whiteboardButton.disabled = false;
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
        } else if (data.type === 'whiteboard-draw') {
            // Handle incoming whiteboard data
            drawRemoteStroke(data.startX, data.startY, data.endX, data.endY, data.color, data.width, data.tool);
        } else if (data.type === 'whiteboard-clear') {
            // Clear the whiteboard on remote clear command
            clearWhiteboardCanvas();
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

// Toggle recording of the call
function toggleRecording() {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
}

// Start recording the call
function startRecording() {
    if (!peerConnection || !remoteVideo.srcObject) {
        alert('Cannot start recording. No active call.');
        return;
    }

    recordedChunks = [];
    
    try {
        // Create a new stream that combines both local and remote video/audio
        const localVideoTrack = localStream.getVideoTracks()[0];
        const localAudioTrack = localStream.getAudioTracks()[0];
        const remoteStream = remoteVideo.srcObject;
        const remoteVideoTrack = remoteStream.getVideoTracks()[0];
        const remoteAudioTrack = remoteStream.getAudioTracks()[0];
        
        // Create a canvas to combine the videos side by side
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const width = 1280;  // Combined width
        const height = 720;  // Height
        canvas.width = width;
        canvas.height = height;
        
        // Create a video processing element for local video
        const localVideoElem = document.createElement('video');
        localVideoElem.srcObject = new MediaStream([localVideoTrack]);
        localVideoElem.autoplay = true;
        localVideoElem.muted = true;
        localVideoElem.play().catch(e => console.error("Error playing local video:", e));
        
        // Create a video processing element for remote video
        const remoteVideoElem = document.createElement('video');
        remoteVideoElem.srcObject = new MediaStream([remoteVideoTrack]);
        remoteVideoElem.autoplay = true;
        remoteVideoElem.play().catch(e => console.error("Error playing remote video:", e));
        
        // Create an audio context to mix the audio
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        
        // Add local audio to the mix if available
        if (localAudioTrack) {
            const localAudioSource = audioContext.createMediaStreamSource(new MediaStream([localAudioTrack]));
            localAudioSource.connect(destination);
        }
        
        // Add remote audio to the mix if available
        if (remoteAudioTrack) {
            const remoteAudioSource = audioContext.createMediaStreamSource(new MediaStream([remoteAudioTrack]));
            remoteAudioSource.connect(destination);
        }
        
        // Create a function to draw the videos on the canvas
        function drawVideos() {
            try {
                // Clear the canvas first
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, width, height);
                
                // Draw local video on the left half
                if (localVideoElem.readyState >= 2) {
                    ctx.drawImage(localVideoElem, 0, 0, width/2, height);
                }
                
                // Draw remote video on the right half
                if (remoteVideoElem.readyState >= 2) {
                    ctx.drawImage(remoteVideoElem, width/2, 0, width/2, height);
                }
                
                // Continue animation
                if (isRecording) {
                    requestAnimationFrame(drawVideos);
                }
            } catch (e) {
                console.error("Error drawing videos to canvas:", e);
                if (isRecording) {
                    requestAnimationFrame(drawVideos);
                }
            }
        }
        
        // Start drawing after a short delay to ensure the video elements are ready
        setTimeout(() => {
            drawVideos();
            
            // Create a stream from the canvas
            const canvasStream = canvas.captureStream(30); // 30 FPS
            
            // Add the mixed audio to the canvas stream
            canvasStream.addTrack(destination.stream.getAudioTracks()[0]);
            
            // Check for supported MIME types
            let options;
            if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
                options = { mimeType: 'video/webm;codecs=vp9,opus' };
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
                options = { mimeType: 'video/webm;codecs=vp8,opus' };
            } else if (MediaRecorder.isTypeSupported('video/webm')) {
                options = { mimeType: 'video/webm' };
            } else {
                options = {};
            }
            
            // Setup media recorder with the combined stream
            mediaRecorder = new MediaRecorder(canvasStream, options);
            
            mediaRecorder.ondataavailable = (event) => {
                console.log("Data available:", event.data.size);
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                console.log("MediaRecorder stopped, chunks:", recordedChunks.length);
                
                if (recordedChunks.length === 0) {
                    console.error("No recorded chunks available");
                    alert("Recording failed. No data was captured.");
                    return;
                }
                
                const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
                console.log("Blob created, size:", blob.size);
                
                if (blob.size === 0) {
                    console.error("Created blob has zero size");
                    alert("Recording failed. The recorded file is empty.");
                    return;
                }
                
                const url = URL.createObjectURL(blob);
                
                // Display recording notification and download option
                const recordingElement = document.createElement('div');
                recordingElement.classList.add('file-message');
                recordingElement.classList.add('sent');
                
                recordingElement.innerHTML = `
                    <div class="file-icon">🎥</div>
                    <div class="file-info">
                        <div class="file-name">Call Recording</div>
                        <div class="file-size">${formatFileSize(blob.size)}</div>
                    </div>
                `;
                
                const downloadButton = document.createElement('button');
                downloadButton.classList.add('file-download');
                downloadButton.textContent = 'Download';
                downloadButton.onclick = () => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `call-recording-${new Date().toISOString().replace(/:/g, '-')}.webm`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                };
                
                const playButton = document.createElement('button');
                playButton.classList.add('file-download');
                playButton.style.marginRight = '5px';
                playButton.textContent = 'Play';
                playButton.onclick = () => {
                    const videoElement = document.createElement('video');
                    videoElement.src = url;
                    videoElement.controls = true;
                    videoElement.style.position = 'fixed';
                    videoElement.style.top = '50%';
                    videoElement.style.left = '50%';
                    videoElement.style.transform = 'translate(-50%, -50%)';
                    videoElement.style.maxWidth = '90%';
                    videoElement.style.maxHeight = '90%';
                    videoElement.style.zIndex = '1001';
                    videoElement.style.backgroundColor = '#000';
                    
                    const closeButton = document.createElement('button');
                    closeButton.textContent = '✕';
                    closeButton.style.position = 'fixed';
                    closeButton.style.top = '10px';
                    closeButton.style.right = '10px';
                    closeButton.style.zIndex = '1002';
                    closeButton.style.backgroundColor = 'rgba(0,0,0,0.5)';
                    closeButton.style.color = 'white';
                    closeButton.style.border = 'none';
                    closeButton.style.borderRadius = '50%';
                    closeButton.style.width = '30px';
                    closeButton.style.height = '30px';
                    closeButton.style.cursor = 'pointer';
                    
                    const overlay = document.createElement('div');
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.right = '0';
                    overlay.style.bottom = '0';
                    overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
                    overlay.style.zIndex = '1000';
                    
                    closeButton.onclick = () => {
                        document.body.removeChild(videoElement);
                        document.body.removeChild(closeButton);
                        document.body.removeChild(overlay);
                    };
                    
                    document.body.appendChild(overlay);
                    document.body.appendChild(videoElement);
                    document.body.appendChild(closeButton);
                    
                    videoElement.play().catch(e => console.error("Error playing video:", e));
                };
                
                recordingElement.appendChild(playButton);
                recordingElement.appendChild(downloadButton);
                chatMessages.appendChild(recordingElement);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                
                // Cleanup
                recordedChunks = [];
            };
            
            // Start recording
            mediaRecorder.start(1000); // Collect data in 1-second chunks
            console.log("MediaRecorder started");
            isRecording = true;
            recordButton.textContent = '⏹️';
            recordButton.classList.add('active');
            
            // Notify the user
            const notificationElement = document.createElement('div');
            notificationElement.classList.add('recording-notification');
            notificationElement.textContent = 'Recording started';
            document.body.appendChild(notificationElement);
            
            setTimeout(() => {
                notificationElement.classList.add('fade-out');
                setTimeout(() => {
                    document.body.removeChild(notificationElement);
                }, 500);
            }, 2000);
        }, 1000); // Wait 1 second before starting to ensure video elements are ready
        
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Could not start recording: ' + error.message);
    }
}

// Stop recording the call
function stopRecording() {
    if (mediaRecorder && isRecording) {
        console.log("Stopping MediaRecorder...");
        try {
            mediaRecorder.stop();
        } catch (e) {
            console.error("Error stopping MediaRecorder:", e);
        }
        isRecording = false;
        recordButton.textContent = '⚫';
        recordButton.classList.remove('active');
        
        // Notify the user
        const notificationElement = document.createElement('div');
        notificationElement.classList.add('recording-notification');
        notificationElement.textContent = 'Recording saved';
        document.body.appendChild(notificationElement);
        
        setTimeout(() => {
            notificationElement.classList.add('fade-out');
            setTimeout(() => {
                document.body.removeChild(notificationElement);
            }, 500);
        }, 2000);
    }
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
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
    // Stop recording if it's in progress
    if (isRecording) {
        stopRecording();
    }
    
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

// Toggle whiteboard visibility
function toggleWhiteboard() {
    if (!isWhiteboardVisible) {
        showWhiteboard();
    } else {
        hideWhiteboard();
    }
}

// Show whiteboard
function showWhiteboard() {
    whiteboardContainer.style.display = 'flex';
    isWhiteboardVisible = true;
    whiteboardButton.classList.add('active');
    
    // Initialize whiteboard canvas
    initializeWhiteboard();
}

// Hide whiteboard
function hideWhiteboard() {
    whiteboardContainer.style.display = 'none';
    isWhiteboardVisible = false;
    whiteboardButton.classList.remove('active');
}

// Initialize whiteboard
function initializeWhiteboard() {
    // Set canvas to fill its container
    resizeWhiteboard();
    
    // Get the 2D drawing context
    whiteboardCtx = whiteboard.getContext('2d');
    
    // Set initial drawing properties
    updateDrawingConfig();
    
    // Clear canvas
    clearWhiteboardCanvas();
    
    // Add event listeners for drawing
    whiteboard.addEventListener('mousedown', startDrawing);
    whiteboard.addEventListener('mousemove', draw);
    whiteboard.addEventListener('mouseup', stopDrawing);
    whiteboard.addEventListener('mouseleave', stopDrawing);
    
    // Add touch support
    whiteboard.addEventListener('touchstart', handleTouchStart);
    whiteboard.addEventListener('touchmove', handleTouchMove);
    whiteboard.addEventListener('touchend', handleTouchEnd);
    
    // Add event listeners for toolbar
    penTool.addEventListener('click', () => setDrawingTool('pen'));
    eraserTool.addEventListener('click', () => setDrawingTool('eraser'));
    colorPicker.addEventListener('input', updateDrawingConfig);
    penSize.addEventListener('change', updateDrawingConfig);
    clearWhiteboard.addEventListener('click', sendClearWhiteboard);
    closeWhiteboard.addEventListener('click', hideWhiteboard);
    
    // Handle resize
    window.addEventListener('resize', resizeWhiteboard);
}

// Resize whiteboard to fit container
function resizeWhiteboard() {
    const container = whiteboardContainer;
    const toolbarHeight = document.querySelector('.whiteboard-toolbar').offsetHeight;
    const paddingTop = parseInt(window.getComputedStyle(container).paddingTop);
    const paddingBottom = parseInt(window.getComputedStyle(container).paddingBottom);
    const availableHeight = container.offsetHeight - toolbarHeight - paddingTop - paddingBottom - 15;
    
    // Save the current drawing
    const imageData = whiteboardCtx ? whiteboardCtx.getImageData(0, 0, whiteboard.width, whiteboard.height) : null;
    
    // Set new dimensions
    whiteboard.width = container.offsetWidth - 40;  // 20px padding on each side
    whiteboard.height = availableHeight;
    
    // Restore the drawing if there was one
    if (imageData && whiteboardCtx) {
        whiteboardCtx.putImageData(imageData, 0, 0);
        updateDrawingConfig();
    }
}

// Update drawing configuration
function updateDrawingConfig() {
    if (!whiteboardCtx) return;
    
    if (currentTool === 'pen') {
        whiteboardCtx.strokeStyle = colorPicker.value;
        whiteboardCtx.lineWidth = parseInt(penSize.value);
        whiteboardCtx.lineCap = 'round';
        whiteboardCtx.lineJoin = 'round';
    } else if (currentTool === 'eraser') {
        whiteboardCtx.strokeStyle = '#ffffff';
        whiteboardCtx.lineWidth = parseInt(penSize.value) * 2;
        whiteboardCtx.lineCap = 'round';
        whiteboardCtx.lineJoin = 'round';
    }
}

// Set active drawing tool
function setDrawingTool(tool) {
    currentTool = tool;
    
    // Update UI
    if (tool === 'pen') {
        penTool.classList.add('active');
        eraserTool.classList.remove('active');
    } else if (tool === 'eraser') {
        eraserTool.classList.add('active');
        penTool.classList.remove('active');
    }
    
    updateDrawingConfig();
}

// Clear whiteboard canvas
function clearWhiteboardCanvas() {
    if (whiteboardCtx) {
        whiteboardCtx.fillStyle = '#ffffff';
        whiteboardCtx.fillRect(0, 0, whiteboard.width, whiteboard.height);
    }
}

// Send clear whiteboard command to remote peer
function sendClearWhiteboard() {
    clearWhiteboardCanvas();
    
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
            type: 'whiteboard-clear'
        }));
    }
}

// Start drawing
function startDrawing(e) {
    isDrawing = true;
    const pos = getWhiteboardPosition(e);
    lastX = pos.x;
    lastY = pos.y;
}

// Draw on move
function draw(e) {
    if (!isDrawing) return;
    
    const pos = getWhiteboardPosition(e);
    const currentX = pos.x;
    const currentY = pos.y;
    
    // Draw the line
    whiteboardCtx.beginPath();
    whiteboardCtx.moveTo(lastX, lastY);
    whiteboardCtx.lineTo(currentX, currentY);
    whiteboardCtx.stroke();
    
    // Send to peer (throttled)
    sendDrawCommand(lastX, lastY, currentX, currentY);
    
    // Update last position
    lastX = currentX;
    lastY = currentY;
}

// Stop drawing
function stopDrawing() {
    isDrawing = false;
}

// Get position relative to whiteboard
function getWhiteboardPosition(e) {
    const rect = whiteboard.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    return { x, y };
}

// Handle touch events
function handleTouchStart(e) {
    e.preventDefault();
    startDrawing(e);
}

function handleTouchMove(e) {
    e.preventDefault();
    draw(e);
}

function handleTouchEnd(e) {
    e.preventDefault();
    stopDrawing();
}

// Send draw command to peer (throttled for performance)
function sendDrawCommand(startX, startY, endX, endY) {
    if (!dataChannel || dataChannel.readyState !== 'open') return;
    
    if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
            dataChannel.send(JSON.stringify({
                type: 'whiteboard-draw',
                startX: startX / whiteboard.width,  // Send relative positions (0-1)
                startY: startY / whiteboard.height,
                endX: endX / whiteboard.width,
                endY: endY / whiteboard.height,
                color: whiteboardCtx.strokeStyle,
                width: whiteboardCtx.lineWidth,
                tool: currentTool
            }));
            throttleTimer = null;
        }, 10);  // 10ms throttle
    }
}

// Draw stroke from remote peer
function drawRemoteStroke(relStartX, relStartY, relEndX, relEndY, color, width, tool) {
    if (!whiteboardCtx) return;
    
    // Convert relative positions (0-1) to actual canvas positions
    const startX = relStartX * whiteboard.width;
    const startY = relStartY * whiteboard.height;
    const endX = relEndX * whiteboard.width;
    const endY = relEndY * whiteboard.height;
    
    // Save current context state
    const currentStyle = whiteboardCtx.strokeStyle;
    const currentWidth = whiteboardCtx.lineWidth;
    
    // Set remote peer's style
    whiteboardCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    whiteboardCtx.lineWidth = width;
    
    // Draw the line
    whiteboardCtx.beginPath();
    whiteboardCtx.moveTo(startX, startY);
    whiteboardCtx.lineTo(endX, endY);
    whiteboardCtx.stroke();
    
    // Restore context state
    whiteboardCtx.strokeStyle = currentStyle;
    whiteboardCtx.lineWidth = currentWidth;
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
recordButton.addEventListener('click', toggleRecording);
whiteboardButton.addEventListener('click', toggleWhiteboard);
fileInput.addEventListener('change', handleFileSelect);
if (testConnectionButton) {
    testConnectionButton.addEventListener('click', testConnection);
}

// Initialize the application
initializeSocket(); 