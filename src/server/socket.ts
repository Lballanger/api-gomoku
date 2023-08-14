import { Server, Socket } from "socket.io";

const nbRows: number = 13;
const pxCells: number = 13;
let winner: string | null = null;
let winningCells: [number, number][] = [];
let currentPlayerId: string | null = null;
let nextPlayerId: string | null = null;

// Définir le nombre maximum de connexions autorisées dans une room
const maxConnectionsPerRoom: number = 100;

// Stocker les informations sur les rooms et le nombre de connexions actives
let rooms: Map<string, number> = new Map();
const players: {
  [room: string]: { id: string; pseudo: string; currentRoom: string }[];
} = {
  "1": [],
  "2": [],
  "3": [],
};

// Stocker les id des joueurs
let joueur1Id: string | null = null;
let joueur2Id: string | null = null;

// Symboles des joueurs
const playerSymbols: string[] = ["O", "X"];

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

export const initializeSocket = (io: Server) => {
  // Écoute de la connexion d'un client
  io.on("connection", (socket: Socket) => {
    console.log("Un client est connecté", socket.id);

    if (joueur1Id === null) {
      joueur1Id = socket.id;
      currentPlayerId = socket.id;
      io.to(socket.id).emit("playerSymbol", playerSymbols[0]);
    } else if (joueur2Id === null) {
      joueur2Id = socket.id;
      nextPlayerId = socket.id;
      io.to(socket.id).emit("playerSymbol", playerSymbols[1]);
    }

    console.log(`Joueur 1 : ${joueur1Id} qui a le symbole ${playerSymbols[0]}`);
    console.log(`Joueur 2 : ${joueur2Id} qui a le symbole ${playerSymbols[1]}`);

    socket.on("joinRoom", (room) => {
      console.log(`Le joueur ${socket.id} a rejoint la room ${room}`);

      // Envoi de l'ID du joueur au client
      socket.emit("gameInitialization", socket.id, grid, currentPlayerId);

      // Vérifier si la room existe déjà dans la map des rooms
      if (!rooms.has(room)) {
        // Créer la room et initialiser le nombre de connexions actives à 0
        rooms.set(room, 0);
      }

      const connectionsCount: number = rooms.get(room) || 0;

      // Vérifier si le nombre de connexions actives a atteint la limite
      if (connectionsCount >= maxConnectionsPerRoom) {
        // Envoyer un message d'erreur au client
        socket.emit(
          "roomFull",
          `La room ${room} est pleine. Veuillez réessayer plus tard.`
        );

        // Refuser la connexion en fermant le socket
        socket.disconnect(true);
        return;
      }

      console.log(rooms);

      // Augmenter le nombre de connexions actives pour cette room
      rooms.set(room, connectionsCount + 1);

      // Joindre la room
      socket.join(room);

      // Ajouter le joueur à la room avec l'ID de la room
      players[room].push({ id: socket.id, pseudo: "test", currentRoom: room });

      console.log(players[room]);
      // Émettre un événement à tous les membres de la room pour informer de la nouvelle connexion
      io.to(room).emit("userJoined", players[room]);

      // ...
      // Autres logiques spécifiques à la room
      // ...
    });

    socket.on("leaveRoom", (room) => {
      console.log(`Le joueur ${socket.id} a quitté la room ${room}`);

      // Supprimer le joueur de la liste des joueurs de cette room
      players[room] = players[room].filter((player) => player.id !== socket.id);

      // Mettre à jour le nombre de connexions actives pour cette room
      const connectionsCount: number = rooms.get(room) || 0;
      rooms.set(room, connectionsCount - 1);

      // Émettre un événement à tous les membres de la room pour informer de la déconnexion
      io.to(room).emit("userLeft", players[room]);
    });

    socket.on("sendInvite", (invitedPlayerId) => {
      console.log(invitedPlayerId);
      console.log(
        `Le joueur ${socket.id} a envoyé une invitation au joueur ${invitedPlayerId}`
      );

      io.to(invitedPlayerId).emit("receivedInvite", socket.id);
    });

    socket.on("acceptInvite", (invitedPlayerId) => {
      console.log(
        `Le joueur ${socket.id} a lancé la partie avec le joueur ${invitedPlayerId}`
      );
      const gameId = generateGameId();

      // Émettre un événement "gameStarted" aux deux joueurs pour informer du lancement de la partie
      io.to(socket.id).emit("gameStarted", gameId);
      io.to(invitedPlayerId).emit("gameStarted", gameId);
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
        rooms = new Map();
        joueur1Id = null;
        joueur2Id = null;
        initializeGrid(nbRows, pxCells);
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
      console.log("Un client est déconnecté");

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

        // Mettre à jour le nombre de connexions actives pour cette room
        const connectionsCount: number = rooms.get(currentRoom) || 0;
        rooms.set(currentRoom, connectionsCount - 1);

        // Émettre un événement à tous les membres de la room pour informer de la déconnexion
        io.to(currentRoom).emit("updatePlayers", players[currentRoom]);
      }

      winner = null;
      winningCells = [];
      currentPlayerId = null;
      nextPlayerId = null;
      rooms = new Map();
      joueur1Id = null;
      joueur2Id = null;
    });
  });
};

// Fonction pour générer l'ID de la partie
function generateGameId(): number {
  return Math.floor(100000 + Math.random() * 900000);
}

function getNewNextPlayerId(): string {
  // Alternez entre deux joueurs
  if (nextPlayerId === joueur1Id) {
    return joueur2Id!;
  } else {
    return joueur1Id!;
  }
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
