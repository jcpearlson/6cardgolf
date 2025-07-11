// WebRTC configuration
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// Game state management (global, to be shared with game.js and ui.js)
const gameState = {
  pc: null,
  dc: null,
  isHost: false,
  gameStarted: false,
  isMyTurn: false,
  roundEnded: false,
  selectedCard: null,
  drawnCard: null,
  deck: [],
  drawPile: [],
  discardPile: [],
  playerHand: [],
  opponentHand: [],
  iceCandidates: [],
  connectionEstablished: false,
};

/**
 * Initiates the WebRTC connection as the host (Step 1).
 * Creates an offer and displays it for the client.
 */
async function createGame() {
  try {
    elements.createGameBtn.disabled = true;
    gameState.isHost = true;
    gameState.pc = new RTCPeerConnection(rtcConfig);
    setupPeerConnection("P1 (Host)");

    gameState.dc = gameState.pc.createDataChannel("game");
    setupDataChannel("P1 (Host)");

    const offer = await gameState.pc.createOffer();
    await gameState.pc.setLocalDescription(offer);
    console.log("P1 (Host): Set local description (offer).");

    await waitForIceGathering();

    const connectionData = {
      offer: gameState.pc.localDescription,
      candidates: gameState.iceCandidates,
    };
    elements.offerCode.value = btoa(JSON.stringify(connectionData));
    elements.hostStep2.style.display = "block";
  } catch (error) {
    handleError("Failed to create game", error);
  }
}

/**
 * Joins a game as the client (Step 2).
 * Processes the host's offer and generates an answer to send back.
 */
async function joinGame() {
  try {
    elements.joinGameBtn.disabled = true;
    const offerCode = elements.pastedOfferCode.value.trim();
    if (!offerCode) throw new Error("Please paste the Offer Code first");

    const connectionData = JSON.parse(atob(offerCode));
    const { offer, candidates } = connectionData;

    gameState.pc = new RTCPeerConnection(rtcConfig);
    setupPeerConnection("P2 (Client)");

    gameState.pc.ondatachannel = (event) => {
      gameState.dc = event.channel;
      setupDataChannel("P2 (Client)");
    };

    await gameState.pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log("P2 (Client): Set remote description from HOST's offer.");

    for (const candidate of candidates) {
      await gameState.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    console.log("P2 (Client): Added all host ICE candidates.");

    const answer = await gameState.pc.createAnswer();
    await gameState.pc.setLocalDescription(answer);
    console.log("P2 (Client): Set local description (answer).");

    await waitForIceGathering();

    const answerData = {
      answer: gameState.pc.localDescription,
      candidates: gameState.iceCandidates,
    };
    elements.generatedAnswerCode.value = btoa(JSON.stringify(answerData));
    elements.joinStep2.style.display = "block";
  } catch (error) {
    handleError("Failed to join game", error);
  }
}

/**
 * Host completes the connection (Step 3).
 * Processes the client's answer to establish the connection.
 */
async function completeConnection() {
  if (!gameState.isHost) return;
  try {
    const answerCode = elements.answerCode.value.trim();
    if (!answerCode) throw new Error("Please paste the Answer Code first");

    const connectionData = JSON.parse(atob(answerCode));
    const { answer, candidates } = connectionData;

    await gameState.pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log("P1 (Host): Set remote description from CLIENT's answer.");

    for (const candidate of candidates) {
      await gameState.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    console.log(
      "P1 (Host): Added all client ICE candidates. Connection should now establish.",
    );

    updateGameStatus("Finalizing connection...");
  } catch (error) {
    handleError("Failed to complete connection", error);
  }
}

function setupPeerConnection(peerId) {
  gameState.pc.onicegatheringstatechange = () =>
    console.log(
      `${peerId}: ICE gathering state:`,
      gameState.pc.iceGatheringState,
    );

  gameState.pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log(`${peerId}: ICE candidate found:`, event.candidate);
      gameState.iceCandidates.push(event.candidate);
    }
  };

  gameState.pc.onconnectionstatechange = () => {
    console.log(`${peerId}: Connection state:`, gameState.pc.connectionState);
    updateConnectionStatus();
    if (
      gameState.pc.connectionState === "disconnected" ||
      gameState.pc.connectionState === "failed"
    ) {
      updateGameStatus("Connection lost. Please refresh to reconnect.");
      gameState.connectionEstablished = false;
    } else if (gameState.pc.connectionState === "connected") {
      gameState.connectionEstablished = true;
    }
  };
}

function setupDataChannel(peerId) {
  gameState.dc.onopen = () => {
    console.log(`${peerId}: Data channel opened`);
    gameState.connectionEstablished = true;
    showGameInterface();
    updateConnectionStatus();
    addChatMessage("system", "Connected! You can now chat and play together.");
    if (gameState.isHost) {
      console.log("Host is starting a new game now that channel is open.");
      startNewGame();
    }
  };

  gameState.dc.onmessage = (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch (e) {
      console.error(e);
    }
  };
  gameState.dc.onclose = () => {
    console.log(`${peerId}: Data channel closed`);
    gameState.connectionEstablished = false;
    updateConnectionStatus();
    updateGameStatus("Connection lost. Please refresh to reconnect.");
  };
  gameState.dc.onerror = (error) => handleError("Connection error", error);
}

function waitForIceGathering() {
  return new Promise((resolve) => {
    if (gameState.pc.iceGatheringState === "complete") {
      resolve();
    } else {
      const checkState = () => {
        if (gameState.pc.iceGatheringState === "complete") {
          gameState.pc.removeEventListener(
            "icegatheringstatechange",
            checkState,
          );
          resolve();
        }
      };
      gameState.pc.addEventListener("icegatheringstatechange", checkState);
    }
  });
}

function sendMessage(message) {
  if (gameState.dc && gameState.dc.readyState === "open") {
    try {
      gameState.dc.send(JSON.stringify(message));
    } catch (error) {
      console.error(error);
    }
  } else {
    console.warn("Data channel not open.");
  }
}

function handleMessage(message) {
  switch (message.type) {
    case "gameStart":
      handleGameStart(message.data);
      break;
    case "gameAction":
      handleGameAction(message.data);
      break;
    case "chat":
      addChatMessage("opponent", message.data.text);
      break;
    case "newGameRequest":
      if (gameState.isHost) {
        startNewGame();
      } else {
        updateGameStatus(
          "Opponent requested a new game. Waiting for host to start...",
        );
      }
      break;
    default:
      console.warn("Unknown message type:", message.type);
  }
}

function disconnect() {
  if (gameState.dc) gameState.dc.close();
  if (gameState.pc) gameState.pc.close();
  resetGameState(); // Resets game state to initial values
  showConnectionSetup(); // Shows the connection setup UI
  updateConnectionStatus(); // Updates connection status display
  updateGameStatus("Disconnected. Create or Join a new game.");
  addChatMessage("system", "Disconnected from opponent.");
  // Restore original UI for connection setup
  elements.initialView.style.display = "block";
  elements.hostView.style.display = "none";
  elements.joinView.style.display = "none";
  elements.hostStep2.style.display = "none";
  elements.joinStep2.style.display = "none";
  elements.createGameBtn.disabled = false;
  elements.joinGameBtn.disabled = false;
}

// Function to reset game state, ensuring it's available globally
function resetGameState(keepConnection = false) {
  Object.assign(gameState, {
    pc: keepConnection ? gameState.pc : null,
    dc: keepConnection ? gameState.dc : null,
    isHost: keepConnection ? gameState.isHost : false,
    connectionEstablished: keepConnection
      ? gameState.connectionEstablished
      : false,
    gameStarted: false,
    isMyTurn: false,
    roundEnded: false,
    selectedCard: null,
    drawnCard: null,
    deck: [],
    drawPile: [],
    discardPile: [],
    playerHand: [],
    opponentHand: [],
    iceCandidates: [],
  });
  if (!keepConnection) {
    elements.chatMessages.innerHTML = "";
    updateGameStatus("Connect with a friend to start playing!");
  }
  updateScoreDisplay();
}
