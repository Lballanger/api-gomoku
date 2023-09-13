import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { initializeSocket } from "./server/socket.js";

const app = express();

const whitelist =
  process.env.NODE_ENV === "production"
    ? [process.env.PROD_CLIENT_URL]
    : [process.env.LOCAL_CLIENT_URL];

app.use(
  cors({
    origin: function (origin, callback) {
      if (whitelist.indexOf(origin as string) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.PROD_CLIENT_URL
        : process.env.LOCAL_CLIENT_URL,
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
