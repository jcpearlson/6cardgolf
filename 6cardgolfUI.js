// DOM elements references
const elements = {
  connectionSetup: document.getElementById("connectionSetup"),
  gameContainer: document.getElementById("gameContainer"),
  initialView: document.getElementById("initialView"),
  hostView: document.getElementById("hostView"),
  joinView: document.getElementById("joinView"),
  showHostViewBtn: document.getElementById("showHostViewBtn"),
  showJoinViewBtn: document.getElementById("showJoinViewBtn"),
  hostStep2: document.getElementById("hostStep2"),
  joinStep2: document.getElementById("joinStep2"),
  offerCode: document.getElementById("offerCode"),
  answerCode: document.getElementById("answerCode"),
  pastedOfferCode: document.getElementById("pastedOfferCode"),
  generatedAnswerCode: document.getElementById("generatedAnswerCode"),
  copyOfferBtn: document.getElementById("copyOfferBtn"),
  copyAnswerBtn: document.getElementById("copyAnswerBtn"),
  connectionStatus: document.getElementById("connectionStatus"),
  turnIndicator: document.getElementById("turnIndicator"),
  gameStatus: document.getElementById("gameStatus"),
  playerHand: document.getElementById("playerHand"),
  opponentHand: document.getElementById("opponentHand"),
  drawPile: document.getElementById("drawPile"),
  discardPile: document.getElementById("discardPile"),
  playerScore: document.getElementById("playerScore"),
  opponentScore: document.getElementById("opponentScore"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  takeDiscardBtn: document.getElementById("takeDiscardBtn"),
  takeDrawBtn: document.getElementById("takeDrawBtn"),
  endTurnBtn: document.getElementById("endTurnBtn"),
  flipCardsBtn: document.getElementById("flipCardsBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  createGameBtn: document.getElementById("createGameBtn"),
  joinGameBtn: document.getElementById("joinGameBtn"),
  confirmConnectionBtn: document.getElementById("confirmConnectionBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  chatSendBtn: document.getElementById("chatSendBtn"),
};

/**
 * Utility to copy text from a textarea to the clipboard
 */
function copyToClipboard(elementId) {
  const textarea = document.getElementById(elementId);
  textarea.select();
  document.execCommand("copy");
  alert("Code copied to clipboard!");
}

function showGameInterface() {
  elements.connectionSetup.style.display = "none";
  elements.gameContainer.classList.add("active", "fade-in");
}

function showConnectionSetup() {
  elements.connectionSetup.style.display = "block";
  elements.gameContainer.classList.remove("active");
}

function updateConnectionStatus() {
  const s = elements.connectionStatus;
  if (gameState.connectionEstablished) {
    s.textContent = "Connected";
    s.className = "connection-status connected";
  } else {
    s.textContent = "Disconnected";
    s.className = "connection-status disconnected";
  }
}

function updateGameUI() {
  updateHandDisplay();
  updatePileDisplay();
  updateTurnIndicator();
  updateControlButtons();
  updateScoreDisplay();
}

function updateHandDisplay() {
  elements.playerHand.innerHTML = "";
  gameState.playerHand.forEach((c, i) => {
    const e = createCardElement(c, true);
    e.onclick = () => handleCardClick(i);
    elements.playerHand.appendChild(e);
  });
  elements.opponentHand.innerHTML = "";
  gameState.opponentHand.forEach((c) => {
    const e = createCardElement(c, false);
    elements.opponentHand.appendChild(e);
  });
}

function createCardElement(c, isPlayerHand) {
  const e = document.createElement("div");
  e.className = "card";
  if (c.faceUp) {
    const { suit: s, value: v } = c.card;
    e.textContent = v + s;
    e.classList.add(s === "♥" || s === "♦" ? "red" : "black");
  } else {
    e.textContent = "?";
    e.classList.add("face-down");
  }
  const canSelectToReplace =
    gameState.isMyTurn &&
    gameState.drawnCard &&
    isPlayerHand &&
    !gameState.roundEnded;
  const canFlipInitial =
    gameState.isMyTurn &&
    !gameState.drawnCard &&
    isPlayerHand &&
    !c.faceUp &&
    !gameState.roundEnded;
  if (canSelectToReplace || canFlipInitial) {
    e.classList.add("selectable");
  } else {
    e.classList.remove("selectable");
  }
  return e;
}

function updatePileDisplay() {
  elements.drawPile.innerHTML = `<div>📚<br>Draw (${gameState.drawPile.length})</div>`;
  elements.discardPile.innerHTML = `<div>🗑️<br>Discard</div>`;
  if (gameState.discardPile.length > 0) {
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const cardElement = createCardElement(
      { card: topCard, faceUp: true },
      false,
    );
    cardElement.classList.remove("selectable"); // Discard pile card should not be selectable in the same way as hand cards
    elements.discardPile.appendChild(cardElement);
  }

  if (
    gameState.isMyTurn &&
    !gameState.drawnCard &&
    gameState.gameStarted &&
    !gameState.roundEnded
  ) {
    elements.drawPile.classList.add("clickable");
    if (gameState.discardPile.length > 0) {
      elements.discardPile.classList.add("clickable");
    } else {
      elements.discardPile.classList.remove("clickable");
    }
  } else {
    elements.drawPile.classList.remove("clickable");
    elements.discardPile.classList.remove("clickable");
  }

  // Assign click handlers directly
  elements.drawPile.onclick = takeFromDraw;
  elements.discardPile.onclick = takeFromDiscard;
}

function updateTurnIndicator() {
  if (!gameState.gameStarted) {
    elements.turnIndicator.textContent = "Waiting to start game...";
    elements.turnIndicator.style.color = "";
  } else if (gameState.roundEnded) {
    elements.turnIndicator.textContent = "Round Over!";
    elements.turnIndicator.style.color = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--primary-color");
  } else if (gameState.isMyTurn) {
    elements.turnIndicator.textContent = "Your Turn!";
    elements.turnIndicator.style.color = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--accent-color");
  } else {
    elements.turnIndicator.textContent = "Opponent's Turn";
    elements.turnIndicator.style.color = getComputedStyle(
      document.documentElement,
    ).getPropertyValue("--primary-color");
  }
}

function updateGameStatus(message) {
  elements.gameStatus.textContent = message;
}

function updateControlButtons() {
  elements.takeDiscardBtn.style.display = "none";
  elements.takeDrawBtn.style.display = "none";
  elements.endTurnBtn.style.display = "none";
  elements.flipCardsBtn.style.display = "none";
  elements.newGameBtn.style.display = "none";

  if (!gameState.gameStarted || gameState.roundEnded) {
    if (gameState.connectionEstablished && gameState.gameStarted) {
      // Only show New Game if connected and a game has been played
      elements.newGameBtn.style.display = "inline-block";
    }
    return;
  }

  if (gameState.isMyTurn) {
    const flippedCount = gameState.playerHand.filter((c) => c.faceUp).length;
    if (flippedCount < 2) {
      elements.flipCardsBtn.style.display = "inline-block"; // Keep flip button visible until 2 cards are flipped
      elements.flipCardsBtn.textContent = `Flip ${2 - flippedCount} card(s)`;
    } else if (!gameState.drawnCard) {
      elements.takeDrawBtn.style.display = "inline-block";
      if (gameState.discardPile.length > 0) {
        elements.takeDiscardBtn.style.display = "inline-block";
      }
    } else {
      elements.endTurnBtn.style.display = "inline-block";
      elements.endTurnBtn.textContent = "Discard Drawn Card";
    }
  }
}

function updateScoreDisplay() {
  if (!gameState.gameStarted || !gameState.roundEnded) {
    elements.playerScore.textContent = "Your Score: ?";
    elements.opponentScore.textContent = "Opponent Score: ?";
  } else {
    calculateAndDisplayScores();
  }
}

function addChatMessage(sender, text) {
  const m = document.createElement("div");
  m.classList.add("chat-message", sender);
  m.textContent = text;
  elements.chatMessages.appendChild(m);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function handleError(context, error) {
  console.error(`${context}:`, error);
  updateGameStatus(`Error: ${context}. Check console for details.`);
  addChatMessage("system", `An error occurred: ${context}`);
}

// Event Listeners (moved from original script for UI interaction)
elements.showHostViewBtn.onclick = () => {
  elements.initialView.style.display = "none";
  elements.hostView.style.display = "block";
};
elements.showJoinViewBtn.onclick = () => {
  elements.initialView.style.display = "none";
  elements.joinView.style.display = "block";
};
elements.createGameBtn.onclick = createGame; // Function from webrtc.js
elements.joinGameBtn.onclick = joinGame; // Function from webrtc.js
elements.confirmConnectionBtn.onclick = completeConnection; // Function from webrtc.js
elements.copyOfferBtn.onclick = () => copyToClipboard("offerCode");
elements.copyAnswerBtn.onclick = () => copyToClipboard("generatedAnswerCode");

elements.disconnectBtn.onclick = disconnect; // Function from webrtc.js
elements.takeDiscardBtn.onclick = takeFromDiscard; // Function from game.js
elements.takeDrawBtn.onclick = takeFromDraw; // Function from game.js
elements.endTurnBtn.onclick = discardDrawnCard; // Function from game.js
elements.flipCardsBtn.onclick = flipInitialCards; // Function from game.js
elements.newGameBtn.onclick = requestNewGame; // Function from game.js
elements.chatSendBtn.onclick = sendChatMessage; // Function from game.js
elements.chatInput.onkeypress = (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendChatMessage(); // Function from game.js
  }
};
