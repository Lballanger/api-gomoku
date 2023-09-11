import { Server, Socket } from "socket.io";

// =======================================================================================
// Configuration du jeu
// =======================================================================================

const nbRows: number = 13;
const pxCells: number = 13;
const maxConnectionsPerRoom: number = 100;
const playerSymbols: string[] = ["O", "X"];

// =======================================================================================
// Données du jeu
// =======================================================================================

let winner: string | null = null;
let winningCells: [number, number][] = [];
let currentPlayerId: string | null = null;
let nextPlayerId: string | null = null;
let joueur1Id: string | null = null;
let joueur2Id: string | null = null;

// =======================================================================================
// Structures de données
// =======================================================================================

interface Room {
  name: string;
  capacity: number;
  path: string;
  activeConnections: number;
}

// Stocker les informations sur les rooms et le nombre de connexions actives
const rooms: Room[] = [
  { name: "Salle 1", capacity: 100, path: "1", activeConnections: 0 },
  { name: "Salle 2", capacity: 100, path: "2", activeConnections: 0 },
  { name: "Salle 3", capacity: 100, path: "3", activeConnections: 0 },
];

// Créez un objet pour stocker les joueurs par room
interface Player {
  id: string;
  pseudo: string;
  currentRoom: string;
}

const players: Record<string, Player[]> = {
  "1": [],
  "2": [],
  "3": [],
};
// Stockage des invitations en attente
const pendingInvitations: {
  [invitedPlayerId: string]: {
    gameId: number;
    invitedBy: string;
    room: string;
  };
} = {};

interface Game {
  id: number;
  players: [string | null, string | null] | null;
  grid: string[][] | null;
  winner: string | null;
}

type Games = Record<string, Game[]>;

let games: Games = {};

// Grille de jeu
const initializeGrid = (rows: number, cols: number): string[][] => {
  const grid: string[][] = [];

  for (let i = 0; i < rows; i++) {
    const row: string[] = Array(cols).fill("");
    grid.push(row);
  }

  return grid;
};

// Stocke l'état actuel de la grille du jeu
let grid: string[][] = initializeGrid(nbRows, pxCells);

// Fonction pour générer l'ID de la partie
function generateGameId(): number {
  return Math.floor(100000 + Math.random() * 900000);
}

// Fonction pour obtenir les cellules gagnantes
const getWinningCells = (
  row: number,
  col: number,
  direction: string
): [number, number][] => {
  const cells: [number, number][] = [];

  if (direction === "horizontal") {
    for (let i = 0; i < 5; i++) {
      cells.push([row, col + i]);
    }
  } else if (direction === "vertical") {
    for (let i = 0; i < 5; i++) {
      cells.push([row + i, col]);
    }
  } else if (direction === "diagonal") {
    for (let i = 0; i < 5; i++) {
      cells.push([row + i, col + i]);
    }
  }

  return cells;
};

// Fonction de vérification de la partie
function checkWin(grid: string[][]): string | null {
  const checkWinCondition = (symbols: string[]): boolean => {
    if (symbols.every((symbol) => symbol === "O")) {
      winner = joueur1Id!;
      return true;
    } else if (symbols.every((symbol) => symbol === "X")) {
      winner = joueur2Id!;
      return true;
    }
    return false;
  };

  const checkHorizontal = () => {
    for (let row = 0; row < nbRows; row++) {
      for (let col = 0; col <= pxCells - 5; col++) {
        const symbols = grid[row].slice(col, col + 5);
        if (checkWinCondition(symbols)) {
          winningCells = getWinningCells(row, col, "horizontal");
          return;
        }
      }
    }
  };

  const checkVertical = () => {
    for (let col = 0; col < pxCells; col++) {
      for (let row = 0; row <= nbRows - 5; row++) {
        const symbols: string[] = [];
        for (let i = 0; i < 5; i++) {
          symbols.push(grid[row + i][col]);
        }
        if (checkWinCondition(symbols)) {
          winningCells = getWinningCells(row, col, "vertical");
          return;
        }
      }
    }
  };

  const checkDiagonal = () => {
    for (let row = 0; row <= nbRows - 5; row++) {
      for (let col = 0; col <= pxCells - 5; col++) {
        const symbols: string[] = [];
        for (let i = 0; i < 5; i++) {
          symbols.push(grid[row + i][col + i]);
        }
        if (checkWinCondition(symbols)) {
          winningCells = getWinningCells(row, col, "diagonal");
          return;
        }
      }
    }

    for (let row = 0; row <= nbRows - 5; row++) {
      for (let col = pxCells - 1; col >= 4; col--) {
        const symbols: string[] = [];
        for (let i = 0; i < 5; i++) {
          symbols.push(grid[row + i][col - i]);
        }
        if (checkWinCondition(symbols)) {
          winningCells = getWinningCells(row, col, "diagonal");
          return;
        }
      }
    }
  };

  checkHorizontal();
  checkVertical();
  checkDiagonal();

  if (winner !== null) {
    console.log(`Le joueur ${winner} a gagné`);
    return winner;
  }

  return null; // Retourne null s'il n'y a pas de gagnant
}

function getNewNextPlayerId(): string {
  // Alternez entre deux joueurs
  if (nextPlayerId === joueur1Id) {
    return joueur2Id!;
  } else {
    return joueur1Id!;
  }
}

export const initializeSocket = (io: Server) => {
  // Écoute de la connexion d'un client
  io.on("connection", (socket: Socket) => {
    console.log("Un client est connecté", socket.id);

    // Émettre un événement au client pour lui confirmer la connexion
    socket.emit("socketConnected", socket.id);

    // Émettre un événement au client pour lui envoyer les informations des rooms
    console.log(rooms);

    socket.emit("roomInformation", rooms);

    socket.on("joinRoom", (room) => {
      const findRoom = rooms.find((r) => r.path === room);

      // Vérifier si le nombre de connexions actives a atteint la limite
      if (findRoom && findRoom.activeConnections >= maxConnectionsPerRoom) {
        // Envoyer un message d'erreur au client
        socket.emit(
          "roomFull",
          `La room ${room} est pleine. Veuillez réessayer plus tard.`
        );
        return;
      }

      // vérifier que le socket n'est pas déjà dans la room
      if (socket.rooms.has(room)) {
        console.log("Le joueur est déjà dans la room");
        return;
      }

      if (findRoom) {
        // Incrémentez le nombre de connexions actives pour cette room
        findRoom.activeConnections += 1;
        socket.join(findRoom.path); // Joignez le salon correspondant
        // Émettre l'événement roomInformation au client pour lui envoyer les informations des rooms
        io.emit("roomInformation", rooms);

        // Ajouter le joueur à la room avec l'ID de la room
        players[room].push({
          id: socket.id,
          pseudo: "test",
          currentRoom: room,
        });
        console.log(players[room]);

        // Émettez les informations sur la room et les joueurs aux clients
        io.to(room).emit("userJoined", players[room]);

        console.log(`Client ${socket.id} a rejoint la room ${room}`);
      } else {
        console.log(`La room ${room} n'existe pas`);
      }
    });

    socket.on("leaveRoom", (room) => {
      console.log("Un client à quitté la room", socket.id);

      // Recherchez la room à laquelle le client était connecté
      let roomPath: string | null = null;

      socket.rooms.forEach((r) => {
        if (r !== socket.id && r == room) {
          roomPath = room as string;
        }
      });

      if (roomPath) {
        // Trouvez la room correspondante
        const room = rooms.find((r) => r.path === roomPath);

        if (room) {
          // Décrémentez le nombre de connexions actives pour cette room
          room.activeConnections -= 1;
          // Émettre l'événement roomInformation au client pour lui envoyer les informations des rooms
          io.emit("roomInformation", rooms);
          // Retirez le client de la liste des joueurs de la room
          const playerIndex = players[roomPath].findIndex(
            (player) => player.id === socket.id
          );
          if (playerIndex !== -1) {
            players[roomPath].splice(playerIndex, 1);
          }

          // Supprimer la room du socket
          socket.leave(roomPath);

          // Émettez les informations mises à jour aux clients restants dans la room
          io.to(room.path).emit("userLeft", players[roomPath]);

          console.log(`Client ${socket.id} a quitté la room ${roomPath}`);
          console.log(players[roomPath]);
        }
      }
    });

    socket.on("sendInvite", (invitedPlayerId) => {
      console.log(
        `Le joueur ${socket.id} a envoyé une invitation au joueur ${invitedPlayerId}`
      );

      // Recherchez la room à laquelle le client est connecté
      let roomPath: string | null = null;

      socket.rooms.forEach((r) => {
        if (r !== socket.id) {
          roomPath = r;
        }
      });

      const gameId = generateGameId();

      if (!roomPath) {
        return;
      }

      // Stocker l'invitation en attente
      pendingInvitations[invitedPlayerId] = {
        gameId,
        invitedBy: socket.id,
        room: roomPath,
      };

      socket.join(gameId.toString());
      joueur1Id = socket.id;
      joueur2Id = invitedPlayerId;
      currentPlayerId = socket.id;
      nextPlayerId = invitedPlayerId;
      io.to(socket.id).emit("playerSymbol", playerSymbols[0]);

      io.to(invitedPlayerId).emit("receivedInvite", socket.id);
    });

    socket.on("acceptInvite", (invitedPlayerId) => {
      console.log(
        `Le joueur ${socket.id} à accepté la partie avec le joueur ${invitedPlayerId}`
      );

      // Récupérer l'invitation en attente
      const { gameId, invitedBy, room } = pendingInvitations[socket.id];

      // Supprimer l'invitation en attente
      delete pendingInvitations[socket.id];

      // Rejoindre la room de la partie
      socket.join(gameId.toString());

      io.to(socket.id).emit("playerSymbol", playerSymbols[1]);

      // Envoie de l'événement "gameInitialization" à tous les membres de la room
      io.to(socket.id).emit(
        "gameInitialization",
        socket.id,
        grid,
        currentPlayerId,
        gameId
      );

      io.to(invitedBy).emit(
        "gameInitialization",
        invitedPlayerId,
        grid,
        currentPlayerId,
        gameId
      );

      if (!games[room]) {
        games[room] = [];
      }

      games[room].push({
        id: gameId,
        players: [socket.id, invitedPlayerId],
        grid,
        winner: null,
      });

      io.to(room).emit("gameList", games[room]);

      console.log(
        `Joueur 1 : ${joueur1Id} qui a le symbole ${playerSymbols[0]}`
      );
      console.log(
        `Joueur 2 : ${joueur2Id} qui a le symbole ${playerSymbols[1]}`
      );
    });

    // Gestion de l'événement "updateGrid"
    socket.on("setUpdateGrid", (currentPlayer, updatedGrid) => {
      console.log("Mise à jour de la grille");
      console.log(
        `Joueur courant : ${currentPlayer} et joueur actuel : ${currentPlayerId}`
      );
      if (currentPlayer !== currentPlayerId) {
        return; // Ignorer la mise à jour si ce n'est pas le tour du joueur qui envoie la mise à jour
      }
      grid = updatedGrid;

      // Vérification de la partie et envoi de l'événement "gameOver" si nécessaire
      const winningPlayer = checkWin(grid);

      if (winningPlayer !== null) {
        io.emit("gameOver", grid, currentPlayer, winningPlayer, winningCells);
        console.log("Envoi de l'événement gameOver - FIN DE LA PARTIE");

        // Réinitialisation de la grille
        grid = initializeGrid(nbRows, pxCells);

        // Réinitialisation des variables
        winner = null;
        winningCells = [];
        currentPlayerId = null;
        nextPlayerId = null;
        joueur1Id = null;
        joueur2Id = null;
        initializeGrid(nbRows, pxCells);

        // Récuperer la room de la partie
        const room = Object.keys(games).find((key) =>
          games[key].find((game) => game.players?.includes(socket.id))
        );

        // Supprimer la partie de la liste des parties
        if (room) {
          games[room] = games[room].filter(
            (game) => !game.players?.includes(socket.id)
          );

          io.to(room).emit("gameList", games[room]);
        }

        // Émettre l'événement roomInformation au client pour lui envoyer les informations des rooms
        io.emit("roomInformation", rooms);
      } else {
        console.log(
          "Envoi de la grille mise à jour à tous les clients connectés"
        );
        // Mettre à jour currentPlayerId avec l'ID du prochain joueur
        currentPlayerId = nextPlayerId;
        // Mettre à jour nextPlayerId avec l'ID du prochain joueur
        nextPlayerId = getNewNextPlayerId();
        // Envoi de la grille mise à jour à tous les clients connectés
        io.emit("gridUpdated", grid, currentPlayerId);
      }
    });

    // Gestion de la déconnexion d'un client
    socket.on("disconnect", () => {
      console.log(`Un client est déconnecté ${socket.id}`);

      let disconnectedPlayer = null;

      // Chercher le joueur déconnecté dans chaque room
      for (const room in players) {
        const player = players[room].find(
          (playerData) => playerData.id === socket.id
        );
        if (player) {
          disconnectedPlayer = player;
          break; // Sortir de la boucle si le joueur est trouvé dans une room
        }
      }

      if (disconnectedPlayer) {
        const { currentRoom } = disconnectedPlayer;
        // Supprimer le joueur de la liste des joueurs de cette room
        players[currentRoom] = players[currentRoom].filter(
          (player) => player.id !== socket.id
        );

        rooms.forEach((room) => {
          if (room.path === currentRoom) {
            room.activeConnections -= 1;
          }
        });
        // Émettre l'événement roomInformation au client pour lui envoyer les informations des rooms
        io.emit("roomInformation", rooms);

        // Émettre un événement à tous les membres de la room pour informer de la déconnexion
        io.to(currentRoom).emit("updatePlayers", players[currentRoom]);
      }

      winner = null;
      winningCells = [];
      currentPlayerId = null;
      nextPlayerId = null;
      // rooms = new Map();
      joueur1Id = null;
      joueur2Id = null;
    });
  });
};
