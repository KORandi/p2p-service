/* eslint-disable @typescript-eslint/no-require-imports */
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const dotenv = require("dotenv");

// Load environment variables from .env file
dotenv.config();

// Configuration
const API_URL = process.env.API_URL || "http://localhost:8766"; // Default to localhost if not specified
const NUM_CARDS = 50;
const BATCH_SIZE = 100; // Number of cards to create per batch
const DELAY_BETWEEN_BATCHES_MS = 200; // Delay between batches to avoid overwhelming the server

/**
 * Generate a random balance between min and max (inclusive)
 */
function getRandomBalance(min = 0, max = 1000) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

/**
 * Create a single card
 */
async function createCard() {
  const uid = uuidv4();
  const balance = getRandomBalance();

  try {
    const response = await axios.post(`${API_URL}/api/card`, {
      uid,
      balance,
    });

    return response.data;
  } catch (error) {
    console.error(`Failed to create card: ${error.message}`);
    if (error.response) {
      console.error("Response details:", error.response.data);
    }
    throw error;
  }
}

/**
 * Create cards in batches to avoid overwhelming the server
 */
async function createCardsInBatches() {
  console.log(`Starting to create ${NUM_CARDS} test cards at ${API_URL}...`);

  const createdCards = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < NUM_CARDS; i += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, NUM_CARDS - i);
    console.log(
      `Creating batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
        NUM_CARDS / BATCH_SIZE
      )} (${batchSize} cards)...`
    );

    const batchPromises = [];

    for (let j = 0; j < batchSize; j++) {
      batchPromises.push(
        createCard()
          .then((card) => {
            successCount++;
            return card;
          })
          .catch((error) => {
            console.warn("Failed request:", error);
            failCount++;
            return null;
          })
      );
    }

    const batchResults = await Promise.all(batchPromises);
    createdCards.push(...batchResults.filter((card) => card !== null));

    // Progress update
    console.log(
      `Progress: ${
        i + batchSize
      }/${NUM_CARDS} cards (${successCount} successful, ${failCount} failed)`
    );

    // Add delay between batches if not the last batch
    if (i + BATCH_SIZE < NUM_CARDS) {
      console.log(`Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`);
      await new Promise((resolve) =>
        setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS)
      );
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(`Total cards requested: ${NUM_CARDS}`);
  console.log(`Successfully created: ${successCount}`);
  console.log(`Failed to create: ${failCount}`);

  // Save first few card examples
  console.log("\nSample of created cards:");
  createdCards.slice(0, 5).forEach((card) => console.log(card));

  return createdCards;
}

// Run the script
createCardsInBatches()
  .then(() => {
    console.log("Test card creation completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
