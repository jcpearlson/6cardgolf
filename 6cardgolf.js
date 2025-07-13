// Game constants
const SUITS = ['♥', '♦', '♣', '♠'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_VALUES = {
  'K': 0, 'A': 1, 'J': 10, 'Q': 10,
  '2': -2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10
};

// --- Game Logic Functions ---

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit: suit, value: value });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    // Select a random deck position j, then swap card positioned at I with card positioned at J
    const j = Math.floor(Math.random() * (i + 1)); // edge cases floor( 52*.9999) = 51 max card position, floor(1*.99) =0. full range 0-51 acheved
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function startNewGame() {
  if (!gameState.isHost) return;
  try {
    resetGameState(true); // Keep connection, but reset game specifics
    gameState.deck = createDeck();
    shuffleDeck(gameState.deck);

    // Deal cards
    for (let i = 0; i < 6; i++) {
      gameState.playerHand.push({ card: gameState.deck.pop(), faceUp: false });
      gameState.opponentHand.push({ card: gameState.deck.pop(), faceUp: false });
    }

    gameState.drawPile = [...gameState.deck];
    gameState.discardPile = [gameState.drawPile.pop()];

    gameState.gameStarted = true;
    gameState.roundEnded = false;
    gameState.isMyTurn = false; // No one's turn yet, it's flipping phase
    gameState.selectedCard = null;
    gameState.drawnCard = null;
    gameState.flippedInitialCards = 0; // Track how many initial cards are flipped by current player
    gameState.flippedOpponentInitialCards = 0; // Initialize for host to track opponent's flips
    gameState.flippedHostInitialCards = 0; // Initialize for host to track their own flips

    // Send initial game state to opponent
    sendMessage({
      type: "gameStart",
      data: {
        playerHand: gameState.opponentHand.map(h => h.card), // Opponent's playerHand is my opponentHand (cards only)
        opponentHand: gameState.playerHand.map(h => h.card), // Opponent's opponentHand is my playerHand (cards only)
        drawPile: gameState.drawPile,
        discardPile: gameState.discardPile[0],
        hostStartsFlipping: true // Indicate to client that host starts the initial flipping
      }
    });

    updateGameUI();
    // Host starts flipping their initial cards
    flipInitialCards();
    elements.newGameBtn.style.display = "none";
    updateGameStatus("Flip two of your cards to start the game.");

  } catch (e) {
    handleError("Failed to start game", e);
  }
}

function handleGameStart(data) {
  resetGameState(true); // Keep connection, but reset game specifics
  gameState.gameStarted = true;
  gameState.playerHand = data.playerHand.map(c => ({ card: c, faceUp: false }));
  gameState.opponentHand = data.opponentHand.map(c => ({ card: c, faceUp: false }));
  gameState.drawPile = data.drawPile;
  gameState.discardPile = [data.discardPile];
  gameState.isMyTurn = false; // No one's turn yet, it's flipping phase
  gameState.roundEnded = false;
  gameState.selectedCard = null;
  gameState.drawnCard = null;
  gameState.flippedInitialCards = 0;
  gameState.flippedOpponentInitialCards = 0; // Initialize for client
  gameState.flippedHostInitialCards = 0; // Initialize for client

  updateGameUI();
  if (data.hostStartsFlipping) {
    updateGameStatus("Waiting for opponent to flip their cards.");
  } else {
    flipInitialCards();
    updateGameStatus("Flip two of your cards to start the game.");
  }
  elements.newGameBtn.style.display = "none";
}

function handleGameAction(action) {
  console.log('Received game action:', action.type, action);

  switch (action.type) {
    case 'cardFlipped':
      if (gameState.opponentHand[action.cardIndex]) {
        gameState.opponentHand[action.cardIndex].faceUp = true;
        // Ensure the full card object (suit and value) is updated
        gameState.opponentHand[action.cardIndex].card = action.card;
      }
      // Check if it's an initial flip by the opponent
      if (action.isInitialFlip) {
        if (gameState.isHost) { // Host is tracking both initial flips
          gameState.flippedOpponentInitialCards = (gameState.flippedOpponentInitialCards || 0) + 1;
          if (gameState.flippedOpponentInitialCards === 2 && gameState.flippedInitialCards === 2) {
            // Both players have flipped 2 initial cards, now determine who starts the actual game
            determineFirstTurn();
          }
        } else { // Client is tracking their own initial flips
            // No action needed here for client, host will determine and inform
        }
      }
      break;
    case 'initialFlipComplete': // New message type for when a player finishes initial flips
        if (gameState.isHost) {
            gameState.flippedOpponentInitialCards = 2; // Opponent has completed their initial flips
            if (gameState.flippedInitialCards === 2) { // Check if host also completed
                determineFirstTurn();
            }
        } else { // Client receives this from host after host has completed their flips, if client needs to flip
            // This message is mostly for host to confirm client is done, or for client to know host is done.
            // The actual turn determination will come with 'startTurn' message.
        }
        break;
    case 'startTurn':
        gameState.isMyTurn = action.isMyTurn;
        updateGameUI();
        if (gameState.isMyTurn) {
            updateGameStatus("It's your turn! Draw a card or take from discard.");
        } else {
            updateGameStatus("Opponent's turn. Waiting for their move...");
        }
        break;
    case 'cardReplaced':
      if (gameState.opponentHand[action.cardIndex]) {
        gameState.opponentHand[action.cardIndex] = { card: action.newCard, faceUp: true };
      }
      gameState.discardPile = [action.discardedCard];
      gameState.drawnCard = null; // Opponent's drawn card is now discarded or replaced
      gameState.isMyTurn = true; // It becomes your turn after opponent's action
      updateGameStatus('Opponent replaced a card. Your turn!');
      break;
    case 'cardDiscarded':
      gameState.discardPile = [action.discardedCard];
      gameState.drawnCard = null; // Opponent's drawn card is now discarded
      gameState.isMyTurn = true; // It becomes your turn after opponent's action
      updateGameStatus('Opponent discarded the card. Your turn!');
      break;
    case 'roundEnded':
      gameState.roundEnded = true;
      // Ensure opponentHand is fully revealed using the full card objects from finalPlayerHand
      gameState.opponentHand = action.finalPlayerHand.map(c => ({ card: c, faceUp: true }));
      gameState.playerHand.forEach(h => h.faceUp = true); // Ensure own hand is also fully revealed
      calculateAndDisplayScores();
      elements.newGameBtn.style.display = 'inline-block';
      updateGameStatus('Round ended! Scores calculated. Click "New Game" to play again.');
      break;
  }
  updateGameUI();
}

function handleCardClick(index) {
  if (!gameState.gameStarted || gameState.roundEnded) return;

  const cardInHand = gameState.playerHand[index];

  // Logic for initial two card flips (before drawing/taking phase)
  if (gameState.flippedInitialCards < 2 && !cardInHand.faceUp && gameState.isMyTurn === false) { // isMyTurn is false during initial flip phase
    cardInHand.faceUp = true;
    gameState.flippedInitialCards++;
    sendMessage({ type: "gameAction", data: { type: "cardFlipped", cardIndex: index, card: cardInHand.card, isInitialFlip: true } });
    updateGameUI();

    if (gameState.flippedInitialCards === 2) {
        updateGameStatus("You have flipped two cards. Waiting for opponent to flip their cards.");
        // Inform opponent that current player has finished initial flips
        sendMessage({ type: "gameAction", data: { type: "initialFlipComplete" } });

        if (gameState.isHost) {
            gameState.flippedHostInitialCards = 2; // Host records their own flips
            if (gameState.flippedOpponentInitialCards === 2) {
                determineFirstTurn();
            }
        }
    } else if (gameState.flippedInitialCards < 2) {
      updateGameStatus(`Flip ${2 - gameState.flippedInitialCards} more card(s).`);
    }
    return;
  }

  // Logic for replacing a card after drawing/taking from discard
  if (gameState.drawnCard && gameState.isMyTurn) {
    gameState.selectedCard = index; // Store selected index for replacement
    replaceCard(index);
  } else if (gameState.isMyTurn && gameState.playerHand.filter(c => c.faceUp).length === 2) { // Only show this if it's the actual turn AND initial flips are done
    updateGameStatus("Draw a card from the Draw Pile or take from Discard Pile first.");
  }
}

function determineFirstTurn() {
    if (!gameState.isHost) return; // Only host determines the first turn

    const randomPlayerStarts = Math.random() < 0.5; // True for host, false for client
    gameState.isMyTurn = randomPlayerStarts;
    sendMessage({ type: "gameAction", data: { type: "startTurn", isMyTurn: !randomPlayerStarts } });

    updateGameUI();
    if (gameState.isMyTurn) {
        updateGameStatus("You go first! Draw a card or take from discard.");
    } else {
        updateGameStatus("Opponent goes first. Waiting for their move...");
    }
}

function takeFromDiscard() {
  if (!gameState.isMyTurn || gameState.drawnCard || !gameState.gameStarted || gameState.roundEnded) return;
  if (gameState.discardPile.length === 0) {
    updateGameStatus("Discard pile is empty!");
    return;
  }
  gameState.drawnCard = gameState.discardPile.pop(); // Take the top card from discard
  updateGameUI();
  updateGameStatus("You took a card from the discard pile. Now choose a card to replace in your hand, or discard the drawn card.");
  elements.takeDrawBtn.style.display = "none";
  elements.takeDiscardBtn.style.display = "none";
  elements.endTurnBtn.style.display = "inline-block"; // Show discard drawn card button
  elements.playerHand.querySelectorAll(".card").forEach(c => c.classList.add("selectable")); // Make hand cards selectable for replacement
}

function takeFromDraw() {
  if (!gameState.isMyTurn || gameState.drawnCard || !gameState.gameStarted || gameState.roundEnded) return;
  if (gameState.drawPile.length === 0) {
    updateGameStatus("Draw pile is empty! Round ends.");
    endRound();
    return;
  }
  gameState.drawnCard = gameState.drawPile.pop(); // Draw a card
  updateGameUI();
  updateGameStatus("You drew a card. Now choose a card to replace in your hand, or discard the drawn card.");
  elements.takeDrawBtn.style.display = "none";
  elements.takeDiscardBtn.style.display = "none";
  elements.endTurnBtn.style.display = "inline-block"; // Show discard drawn card button
  elements.playerHand.querySelectorAll(".card").forEach(c => c.classList.add("selectable")); // Make hand cards selectable for replacement
}

function replaceCard(index) {
  if (!gameState.isMyTurn || !gameState.drawnCard || gameState.roundEnded) return;

  const replacedCard = gameState.playerHand[index].card; // The card being replaced
  gameState.playerHand[index] = { card: gameState.drawnCard, faceUp: true }; // Replace and automatically flip face up
  gameState.discardPile.push(replacedCard); // The replaced card goes to discard

  sendMessage({
    type: "gameAction",
    data: {
      type: "cardReplaced",
      cardIndex: index,
      newCard: gameState.drawnCard,
      discardedCard: replacedCard
    }
  });

  gameState.drawnCard = null; // Clear drawn card
  endMyTurn();
}

function discardDrawnCard() {
  if (!gameState.isMyTurn || !gameState.drawnCard || gameState.roundEnded) return;

  gameState.discardPile.push(gameState.drawnCard); // Discard the drawn card
  sendMessage({
    type: "gameAction",
    data: {
      type: "cardDiscarded",
      discardedCard: gameState.drawnCard
    }
  });

  gameState.drawnCard = null; // Clear drawn card
  endMyTurn();
}

function endMyTurn() {
  gameState.isMyTurn = false;
  gameState.selectedCard = null; // Clear any selected card
  updateGameUI();
  updateGameStatus("Turn ended. Waiting for opponent...");
  elements.playerHand.querySelectorAll(".card").forEach(c => c.classList.remove("selectable")); // Remove selectable class from all cards

  // Check if all player's cards are face up after the turn
  const allCardsFlipped = gameState.playerHand.every(card => card.faceUp);
  if (allCardsFlipped && !gameState.roundEnded) {
    endRound(); // Automatically end round if all cards are flipped
  }
}

function endRound() {
  if (gameState.roundEnded) return; // Prevent multiple calls

  gameState.roundEnded = true;
  gameState.isMyTurn = false; // Ensure no more turns

  // Reveal all cards for both players
  gameState.playerHand.forEach(card => card.faceUp = true);

  calculateAndDisplayScores();
  sendMessage({
    type: "gameAction",
    data: {
      type: "roundEnded",
      finalPlayerHand: gameState.playerHand.map(h => h.card), // Send my final revealed hand (only the card object)
    }
  });

  updateGameUI();
  updateGameStatus('Round ended! Scores calculated. Click "New Game" to play again.');
  elements.newGameBtn.style.display = "inline-block";
}

function flipInitialCards() {
  // This function is for the current player to flip their initial two cards.
  updateGameStatus("Click on two cards in your hand to flip them.");
  elements.flipCardsBtn.style.display = "none"; // Hide button once process starts
  elements.playerHand.querySelectorAll(".card").forEach(c => c.classList.add("selectable")); // Make cards clickable for initial flip
}

function calculateScore(hand) {
  let score = 0;
  // Group cards into columns (3 columns for 6 cards)
  const columns = [[], [], []];
  for (let i = 0; i < hand.length; i++) {
    columns[i % 3].push(hand[i]);
  }

  for (const column of columns) {
    // If a column has two cards of the same value, they cancel out (score 0 for that column)
    if (column.length === 2 && column[0].card.value === column[1].card.value) {
      continue;
    } else {
      // Otherwise, sum the values of the cards in the column
      for (const cardInColumn of column) {
        score += CARD_VALUES[cardInColumn.card.value];
      }
    }
  }
  return score;
}

function calculateAndDisplayScores() {
  const playerScore = calculateScore(gameState.playerHand);
  const opponentScore = calculateScore(gameState.opponentHand);

  elements.playerScore.textContent = `Your Score: ${playerScore}`;
  elements.opponentScore.textContent = `Opponent Score: ${opponentScore}`;

  let result = "";
  if (playerScore < opponentScore) {
    result = "You win this round!";
  } else if (playerScore > opponentScore) {
    result = "Opponent wins this round!";
  } else {
    result = "It's a tie!";
  }
  updateGameStatus(`Round Over! ${result}`);
}

function requestNewGame() {
  if (gameState.isHost) {
    startNewGame();
  } else {
    sendMessage({ type: "newGameRequest" });
    updateGameStatus("Requested a new game. Waiting for opponent to accept...");
  }
  elements.newGameBtn.style.display = "none"; // Hide button after request
}

function sendChatMessage() {
  const text = elements.chatInput.value.trim();
  if (text) {
    addChatMessage("own", text);
    sendMessage({ type: "chat", data: { text: text } });
    elements.chatInput.value = ""; // Clear input after sending
  }
}
