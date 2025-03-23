const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create functions directory if it doesn't exist
const functionsDir = path.join(__dirname, 'functions');
if (!fs.existsSync(functionsDir)) {
  fs.mkdirSync(functionsDir);
}

// Copy socketio-server.js to functions directory
const sourcePath = path.join(__dirname, 'functions-src', 'socketio-server.js');
const destPath = path.join(functionsDir, 'socketio-server.js');

if (fs.existsSync(sourcePath)) {
  fs.copyFileSync(sourcePath, destPath);
  console.log('Copied socketio-server.js to functions directory');
  
  // Create package.json for the function
  const functionPackageJson = {
    "name": "socketio-server",
    "version": "1.0.0",
    "description": "Socket.IO server as Netlify function",
    "main": "socketio-server.js",
    "dependencies": {
      "express": "^4.18.2",
      "serverless-http": "^3.2.0",
      "socket.io": "^4.7.4",
      "cors": "^2.8.5"
    }
  };
  
  fs.writeFileSync(
    path.join(functionsDir, 'package.json'),
    JSON.stringify(functionPackageJson, null, 2)
  );
  console.log('Created package.json for function');
  
  // Install dependencies in the function directory
  try {
    console.log('Installing function dependencies...');
    execSync('npm install', { cwd: functionsDir, stdio: 'inherit' });
    console.log('Function dependencies installed');
  } catch (error) {
    console.error('Error installing function dependencies:', error);
  }
} else {
  console.error('Source file not found:', sourcePath);
  process.exit(1);
}

console.log('Build script completed successfully!'); 