const http = require("http");
const express = require("express");
const { Server: SocketServer } = require("socket.io");
const dotenv = require("dotenv");
const cors = require("cors");
const pty = require("node-pty");
const { exec } = require("child_process");

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

const userContainers = new Map();

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    /*== Step 1: Create a new Docker container for this user =*/
    const containerName = `user_container_${socket.id}`;
    const startContainerCmd = `docker run -dit --rm --name ${containerName} -v $(pwd)/workspace:/workspace ubuntu bash`;

    exec(startContainerCmd, (err, stdout, stderr) => {
        if (err) {
            console.error("Error starting container:", err, stderr);
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
            ["exec", "-i", containerId, "bash", "-c", "cd /workspace && bash"],
            {
                name: "xterm-color",
                cols: 80,
                rows: 30,
                env: process.env,
            }
        );

        ptyProcess.onData((data) => {
            // Step 1: Remove ANSI escape codes (color codes, special characters)
            let cleanData = data.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])|\x1b\[[0-9;]*m/g, '');

            // Step 2: Remove common terminal prompts (like `root@...#`)
            cleanData = cleanData.replace(/root@[\w.-]+:.*?#\s*/g, '');

            // Step 3: Trim spaces & newlines
            cleanData = cleanData.trim();

            // Step 4: Ignore isolated `0;` or numbers alone
            if (/^\d+;?$/.test(cleanData)) return;

            // Step 5: Ignore empty strings
            if (!cleanData) return;

            console.log("Filtered Output:", cleanData);
            io.emit("terminal:data", cleanData);
        });

        socket.on("terminal:write", (data) => {
            console.log("Received command:", data);
            ptyProcess.write(data + "\n");
        });


    });
});

server.listen(PORT, () => {
    console.log(`Docker-Server running on PORT ${PORT}`);
});
