const http = require("http");
const express = require("express");
const { Server: SocketServer } = require("socket.io");
const dotenv = require("dotenv");
const cors = require("cors");
var pty = require("node-pty");

/**
 * @config : load the environment varibale from env to process.env file
 */
dotenv.config();
const PORT = process.env.PORT;

const app = express();
const server = http.createServer(app);

const io = new SocketServer(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

/**
 * @cors -> Enable the cross-origin requests from different domains
 */
app.use(cors());

/**
 * @userContainers -> create a brand new instace of docker per user
 */
const userContainers = new Map();

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    /*== Step 1: Create a new Docker container for this user =*/
    const containerName = `user_container_${socket.id}`;
    const startContainerCmd = `docker run -dit --name ${containerName} ubuntu bash`;

    exec(startContainerCmd, (err, stdout) => {
        if (err) {
            console.error("Error starting container:", err);
            socket.emit("error", "Failed to start container.");
            return;
        }

        /*== Step 2: store the docker containerId for every user ==*/
        const containerId = stdout.trim();
        console.log(`Started container: ${containerId}`);
        userContainers.set(socket.id, containerId);

        /* == Create a PTY session inside the container ==*/
        const ptyProcess = pty.spawn(
            "docker",
            ["exec", "-it", containerId, shell],
            {
                name: "xterm-color",
                cols: 80,
                rows: 30,
                cwd: process.env.HOME,
                env: process.env,
            }
        );

        ptyProcess.onData((data) => {
            socket.emit("terminal:data", data);
        });

        socket.on("terminal:write", (data) => {
            ptyProcess.write(data + "\n");
        });
    });
});

app.listen(PORT, () => {
    console.log(`Docker-Server running on PORT ${PORT}`);
});
