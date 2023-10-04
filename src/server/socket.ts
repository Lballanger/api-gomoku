import { Server, Socket } from "socket.io";

// =======================================================================================
// Configuration du jeu
// =======================================================================================

const nbRows: number = 13;
const pxCells: number = 13;
const maxConnectionsPerRoom: number = 100;
const playerSymbols: string[] = ["O", "X"];

// =======================================================================================
// Structures de données
// =======================================================================================

interface Room {
  name: string;
  capacity: number;
  path: string;
  activeConnections: number;
  messages: string[];
}

// Stocker les informations sur les rooms et le nombre de connexions actives
const rooms: Room[] = [
  {
    name: "Salle 1",
    capacity: 100,
    path: "1",
    activeConnections: 0,
    messages: [],
  },
  {
    name: "Salle 2",
    capacity: 100,
    path: "2",
    activeConnections: 0,
    messages: [],
  },
  {
    name: "Salle 3",
    capacity: 100,
    path: "3",
    activeConnections: 0,
    messages: [],
  },
];

// Créez un objet pour stocker les joueurs par room
interface Player {
  id: string;
  pseudo: string;
  currentRoom: string;
}

// Stockage des invitations en attente
const pendingInvitations: {
  [invitedPlayerId: string]: {
    gameId: number;
    invitedBy: string;
    room: string;
    joueur1Id: string;
    joueur2Id: string;
    currentPlayerId: string;
    nextPlayerId: string;
  };
} = {};

interface Game {
  id: number;
  players: [string, string];
  grid: string[][];
  winningCells: number[][];
  currentPlayerId: string;
  nextPlayerId: string;
  joueur1Id: string;
  joueur2Id: string;
  winner: string | null;
  messages: string[][];
}

type Games = Record<string, Game[]>;

const players: Record<string, Player[]> = {
  "1": [],
  "2": [],
  "3": [],
};

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

// Fonction pour générer l'ID de la partie
function generateGameId(): number {
  return Math.floor(100000 + Math.random() * 900000);
}

function randomStartPlayer(): number {
  return Math.round(Math.random());
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
function checkWin(
  grid: string[][],
  joueur1Id: string,
  joueur2Id: string
): {
  winner: string | null;
  winningCells: number[][] | null;
} {
  let winner: string | null = null;
  let winningCells: number[][] | null = null;

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

  return { winner, winningCells };
}

function getNewNextPlayerId(
  nextPlayerId: string,
  joueur1Id: string,
  joueur2Id: string
): string {
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

      const index = rooms.findIndex((r) => r.path === room);

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

        // Émettez les informations sur la room et les joueurs aux clients
        io.to(room).emit("userJoined", players[room]);

        if (index !== -1) {
          io.to(socket.id).emit("receivedMessageInRoom", rooms[index].messages);
        }

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

    socket.on("leaveGameRoom", () => {
      console.log("Un client a quitté la room de jeu");

      // Trouver la room de jeu correspondante
      // Dans le cas d'une déconnexion en jeu
      const gameRoom = Object.keys(games).find((key) =>
        games[key].find((game) => game.players?.includes(socket.id))
      );

      // Supprimer la partie de la liste des parties
      if (gameRoom) {
        const findGame = games[gameRoom].find((game) =>
          game.players?.includes(socket.id)
        );

        if (findGame) {
          io.emit(
            "gameOver",
            findGame.grid,
            findGame.currentPlayerId,
            socket.id === findGame.joueur1Id
              ? findGame.joueur2Id
              : findGame.joueur1Id,
            findGame.winningCells
          );
        }

        games[gameRoom] = games[gameRoom].filter(
          (game) => !game.players?.includes(socket.id)
        );

        io.to(gameRoom).emit("gameList", games[gameRoom]);
      }
    });

    socket.on("sentMessageInRoom", (message) => {
      // Recherchez la room à laquelle le client est connecté
      let roomPath: string | null = null;

      console.log(message);

      socket.rooms.forEach((r) => {
        if (r !== socket.id) {
          roomPath = r;
        }
      });

      if (!roomPath || !message) {
        return;
      }

      console.log(
        `Le client ${socket.id} a envoyé le message ${message} dans la room ${roomPath}`
      );

      // Trouvez l'index de la room correspondante dans le tableau rooms
      const index = rooms.findIndex((r) => r.path === roomPath);

      if (index !== -1) {
        if (rooms[index].messages.length >= 100) rooms[index].messages.shift();

        rooms[index].messages.push(message);
        io.to(roomPath).emit("receivedMessageInRoom", rooms[index].messages);
      }
    });

    socket.on("sentMessageInGame", (message) => {
      // Trouver la room de jeu correspondante
      const gameRoom = Object.keys(games).find((key) =>
        games[key].find((game) => game.players?.includes(socket.id))
      );

      if (gameRoom) {
        const game = games[gameRoom].find((game) =>
          game.players?.includes(socket.id)
        );

        if (game) {
          if (game.messages.length >= 100) game.messages.shift();
          // Ajouter le message à la liste des messages du jeu
          game.messages.push(message);
          io.to(gameRoom).emit("receivedMessageInGame", game.messages);
        }
      }
    });

    socket.on("sendInvite", (invitedPlayerId) => {
      console.log(
        `Le joueur ${socket.id} a envoyé une invitation au joueur ${invitedPlayerId}`
      );

      // Erreur pour l'envoi d'une invitation à soi-même
      if (socket.id === invitedPlayerId) {
        console.log("Vous ne pouvez pas envoyer une invitation à vous même");
        io.to(socket.id).emit("declinedInvite", socket.id);
        io.to(socket.id).emit(
          "error",
          "Vous ne pouvez pas envoyer une invitation à vous-même"
        );
        return;
      }

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

      // Nombre aléatoire pour l'ordre de départ des joueurs
      const numberForStartingPlayer = randomStartPlayer();

      // Stocker l'invitation en attente
      pendingInvitations[invitedPlayerId] = {
        gameId,
        invitedBy: socket.id,
        room: roomPath,
        joueur1Id: socket.id,
        joueur2Id: invitedPlayerId,
        currentPlayerId:
          numberForStartingPlayer === 0 ? socket.id : invitedPlayerId,
        nextPlayerId:
          numberForStartingPlayer === 0 ? invitedPlayerId : socket.id,
      };

      socket.join(gameId.toString());

      io.to(invitedPlayerId).emit("receivedInvite", socket.id);
    });

    socket.on("acceptInvite", (invitedPlayerId) => {
      console.log(
        `Le joueur ${socket.id} à accepté la partie avec le joueur ${invitedPlayerId}`
      );

      // Récupérer l'invitation en attente
      const {
        gameId,
        invitedBy,
        room,
        joueur1Id,
        joueur2Id,
        currentPlayerId,
        nextPlayerId,
      } = pendingInvitations[socket.id];

      // Supprimer l'invitation en attente
      delete pendingInvitations[socket.id];

      // Rejoindre la room de la partie
      socket.join(gameId.toString());

      const grid = initializeGrid(nbRows, pxCells);

      if (!games[room]) {
        games[room] = [];
      }

      games[room].push({
        id: gameId,
        players: [socket.id, invitedPlayerId],
        grid: [...grid],
        winningCells: [],
        currentPlayerId,
        nextPlayerId,
        joueur1Id,
        joueur2Id,
        winner: null,
        messages: [],
      });

      // Random pour l'affectation des symboles aux joueurs
      const randomPlayerSymbol = randomStartPlayer();

      io.to(socket.id).emit("playerSymbol", playerSymbols[randomPlayerSymbol]);

      io.to(invitedPlayerId).emit(
        "playerSymbol",
        playerSymbols[randomPlayerSymbol === 0 ? 1 : 0]
      );

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

      io.to(room).emit("gameList", games[room]);

      console.log(
        `Joueur 1 : ${joueur1Id} qui a le symbole ${playerSymbols[0]}`
      );
      console.log(
        `Joueur 2 : ${joueur2Id} qui a le symbole ${playerSymbols[1]}`
      );
    });

    socket.on("declineInvite", (invitedPlayerId) => {
      console.log(
        `Le joueur ${socket.id} a refusé la partie avec le joueur ${invitedPlayerId}`
      );

      // Supprimer l'invitation en attente
      delete pendingInvitations[socket.id];

      io.to(invitedPlayerId).emit("declinedInvite", socket.id);
    });

    // Gestion de l'événement "updateGrid"
    socket.on("setUpdateGrid", (currentPlayer, updatedGrid) => {
      console.log("Mise à jour de la grille");
      // Récuperer la room de la partie
      const room = Object.keys(games).find((key) =>
        games[key].find((game) => game.players?.includes(socket.id))
      );

      if (!room) return;

      const game = games[room].find((game) =>
        game.players?.includes(socket.id)
      );

      if (!game) return;

      const { currentPlayerId, joueur1Id, joueur2Id, winningCells } = game;

      console.log(
        `Joueur courant : ${currentPlayer} et joueur actuel : ${currentPlayerId}`
      );
      if (currentPlayer !== currentPlayerId) {
        return; // Ignorer la mise à jour si ce n'est pas le tour du joueur qui envoie la mise à jour
      }
      game.grid = updatedGrid;

      // Vérification de la partie et envoi de l'événement "gameOver" si nécessaire
      const winningPlayer = checkWin(game.grid, joueur1Id, joueur2Id);

      if (winningPlayer.winner !== null) {
        io.emit(
          "gameOver",
          game.grid,
          currentPlayer,
          winningPlayer.winner,
          winningPlayer.winningCells
        );
        console.log("Envoi de l'événement gameOver - FIN DE LA PARTIE");

        // Réinitialisation de la grille
        game.grid = initializeGrid(nbRows, pxCells);

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
        game.currentPlayerId = game.nextPlayerId;
        // Mettre à jour nextPlayerId avec l'ID du prochain joueur
        game.nextPlayerId = getNewNextPlayerId(
          game.nextPlayerId,
          game.joueur1Id,
          game.joueur2Id
        );
        // Envoi de la grille mise à jour à tous les clients connectés
        io.emit("gridUpdated", game.grid, game.currentPlayerId);
      }
    });

    // Gestion de la déconnexion d'un client
    socket.on("disconnect", () => {
      console.log(`Un client est déconnecté ${socket.id}`);
      console.log(socket.id);

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

      // Dans le cas d'une déconnexion en jeu
      const gameRoom = Object.keys(games).find((key) =>
        games[key].find((game) => game.players?.includes(socket.id))
      );

      // Supprimer la partie de la liste des parties
      if (gameRoom) {
        const findGame = games[gameRoom].find((game) =>
          game.players?.includes(socket.id)
        );

        if (findGame) {
          io.emit(
            "gameOver",
            findGame.grid,
            findGame.currentPlayerId,
            socket.id === findGame.joueur1Id
              ? findGame.joueur2Id
              : findGame.joueur1Id,
            findGame.winningCells
          );
        }

        games[gameRoom] = games[gameRoom].filter(
          (game) => !game.players?.includes(socket.id)
        );

        io.to(gameRoom).emit("gameList", games[gameRoom]);
      }
    });
  });
};
