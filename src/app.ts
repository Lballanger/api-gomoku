import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { initializeSocket } from "./server/socket.js";

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const port: number = parseInt(process.env.PORT || "3000", 10);

// Initialisation de la gestion du socket
initializeSocket(io);

// Démarrez le serveur
httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
