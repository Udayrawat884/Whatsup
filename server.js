const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let users = {}; // Store connected users with socket IDs
let pendingConnections = {}; // Track pending connection requests
let chatSessions = {}; // Store chat sessions for connected users

io.on('connection', (socket) => {
    console.log('A user connected: ' + socket.id);

    // Store the connected user
    socket.on('register', (username) => {
        users[username] = socket.id;
        console.log(`${username} registered with ID: ${socket.id}`);
    });

    // Handle when a user joins a chat room
    socket.on('join chat', ({ chatSessionId }) => {
        socket.join(chatSessionId);  // Join the room with chatSessionId
        console.log(`User joined chat session: ${chatSessionId}`);
    });

    // Handle chat messages and broadcast to the correct room
    socket.on('chat message', ({ chatSessionId, message }) => {
        io.to(chatSessionId).emit('chat message', message);  // Send message to all users in the room
        console.log(`Message sent in chat session ${chatSessionId}: ${message}`);
    });


    // Handle connection request from one user to another
    socket.on('request connection', ({ fromUser, toUser }) => {
        if (users[toUser]) {
            // Store the pending connection request
            pendingConnections[fromUser] = { toUser, fromUser, fromAccepted: false, toAccepted: false };

            // Send connection request to both users
            io.to(users[toUser]).emit('connection request', { fromUser });
            io.to(users[fromUser]).emit('connection request', { toUser });
        } else {
            // Target user is not online
            socket.emit('user offline', { toUser });
        }
    });

    // Handle response (accept/reject) from both users
    socket.on('connection response', ({ user, targetUser, accepted }) => {
        let pendingConnection = pendingConnections[user] || pendingConnections[targetUser];

        if (!pendingConnection) return;

        if (user === pendingConnection.fromUser) {
            pendingConnection.fromAccepted = accepted;
        } else if (user === pendingConnection.toUser) {
            pendingConnection.toAccepted = accepted;
        }

        // If both users have accepted, start the chat session
        if (pendingConnection.fromAccepted && pendingConnection.toAccepted) {
            // Create a unique chat session for the two users
            const chatSessionId = `${pendingConnection.fromUser}-${pendingConnection.toUser}`;
            chatSessions[chatSessionId] = { fromUser: pendingConnection.fromUser, toUser: pendingConnection.toUser };

            // Notify both users to join the chat session
            io.to(users[pendingConnection.fromUser]).emit('connection accepted', { chatSessionId });
            io.to(users[pendingConnection.toUser]).emit('connection accepted', { chatSessionId });

            // Remove the pending connection as it is now active
            delete pendingConnections[pendingConnection.fromUser];
        }

        if (!accepted) {
            // If either user rejects, notify the other user
            io.to(users[pendingConnection.fromUser]).emit('connection rejected', { targetUser });
            io.to(users[pendingConnection.toUser]).emit('connection rejected', { targetUser });

            // Remove the pending connection
            delete pendingConnections[pendingConnection.fromUser];
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const user = Object.keys(users).find(username => users[username] === socket.id);
        if (user) delete users[user];
        console.log('User disconnected: ' + socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});