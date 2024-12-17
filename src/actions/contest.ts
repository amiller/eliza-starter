import {
    Action,
    Memory,
    State,
    IAgentRuntime,
    HandlerCallback,
    generateText,
    elizaLogger,
    ModelClass,
} from "@ai16z/eliza";

// In-memory storage for contest state
interface ContestState {
  article: string;
  secretWord: string;
  hintsGiven: number;
}

let contestState: ContestState | null = null;

/*{
    name: "LOG_SNAPSHOT",
    similes: [
        "SAVE_LOGS",
        "SNAPSHOT_LOGS",
        "CAPTURE_LOGS",
    ],
    description: "Creates a snapshot of the last 5 minutes of logs",
    
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State
    ) => {
        return true;
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        options: any,
        callback: HandlerCallback
    ) => {
        if (!state) {
            state = (await runtime.composeState(message)) as State;
        }

        const logDirectory = path.join(process.cwd(), 'logs', runtime.character.name);
        const snapshotDir = path.join(logDirectory, 'snapshots');
        
        if (!fs.existsSync(snapshotDir)) {
            fs.mkdirSync(snapshotDir, { recursive: true });
        }

        const currentLog = path.join(logDirectory, 'agent.log');
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const recentLogs = fs.readFileSync(currentLog, 'utf8')
            .split('\n')
            .filter(line => {
                try {
                    const timestampStr = line.trim().split(' [')[0];
                    const timestamp = new Date(timestampStr).getTime();
                    return timestamp >= fiveMinutesAgo;
                } catch (e) {
                    return false; // Skip invalid lines
                }
            })
            .join('\n');

        const snapshotPath = path.join(
            snapshotDir, 
            `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
        );
        
        fs.writeFileSync(snapshotPath, recentLogs);
        return `Snapshot saved to ${snapshotPath}`;
    },

    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "save a snapshot of recent logs",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Creating a snapshot of the last 5 minutes of logs",
                    action: "LOG_SNAPSHOT",
                },
            },
        ],
    ],
} as Action; */

export const start_game: Action = {
  name: "START_GAME",
  similes: [
    "START_CONTEST",
    "NEW_GAME",
    "BEGIN_GAME"
  ],
  description: "Start a new word guessing contest",
  
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State
  ) => {
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    elizaLogger.log("Fetching random Wikipedia article...");
    
    const response = await fetch("https://en.wikipedia.org/api/rest_v1/page/random/summary");
    const data = await response.json();
    const article = data.extract;

    elizaLogger.log("Article generated, selecting secret word...");

    const wordPrompt = `
      Article: "${article}"
      
      Select one interesting word from this article that would make a good word for a guessing game.
      The word should be:
      - Between 4-10 letters
      - A common noun or verb
      - Not too obvious or too obscure
      
      Return only the word, nothing else.
    `;

    const secretWord = (await generateText({
      runtime,
      context: wordPrompt,
      modelClass: ModelClass.SMALL,
      stop: ["\n\n"]
    })).toLowerCase().trim();

    elizaLogger.log(`Secret word selected: ${secretWord}`);

    contestState = {
      article,
      secretWord,
      hintsGiven: 0
    };

    elizaLogger.log("Game initialized successfully", {
      articleLength: article.length,
      wordLength: secretWord.length,
      userId: message.userId
    });

    callback({
      text: "I've started a new game! I've picked a secret word from an interesting article. Try to guess it! Use 'give hint' for a clue."
    });
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "let's start the game game",
        },
      },
      {
        user: "Tee16Z",
        content: {
          text: "I've started a new game! I've picked a secret word from an interesting article. Try to guess it! Use 'give hint' for a clue.",
          action: "START_GAME",
        },
      },
    ],
  ]
};

export const give_hint: Action = {
  name: "GIVE_HINT",
  similes: [
    "PROVIDE_HINT",
    "GET_CLUE",
    "REQUEST_HINT"
  ],
  description: "Provide a hint for the current word contest",
  
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State
  ) => {
    return contestState !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    if (!contestState) {
      return "There's no active game right now. Start a new game first!";
    }

    contestState.hintsGiven++;
    
    const hintPrompt = `
      Article: "${contestState.article}"
      Secret word: "${contestState.secretWord}"
      Previous hints given: ${contestState.hintsGiven - 1}
      
      Generate a clever hint about the secret word. 
      - Don't reveal the word directly
      - If possible, the hint should be inspired by the 
      - Use context from the article
      - Make it challenging but fair
      - Keep it short (under 15 words)
      
      Return only the hint, no other text.
    `;

    callback({
      text: await generateText({
        runtime,
        context: hintPrompt,
        modelClass: ModelClass.LARGE,
        stop: ["\n\n"]
      })
    });
  },

  examples: []
};

export const check_guess: Action = {
  name: "CHECK_GUESS",
  similes: [
    "VERIFY_GUESS",
    "TRY_WORD",
    "ATTEMPT_GUESS"
  ],
  description: "Check if a guessed word matches the secret word",
  
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State
  ) => {
    return contestState !== null;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback
  ) => {
    if (!contestState) {
      return "There's no active game running. Start a new game first!";
    }

    // Extract the guessed word from the message using a prompt
    const extractPrompt = `
      Extract just the guessed word from this message: "${message.content.text}"
      Return only the single word, no other text.
    `;

    const extractedGuess = await generateText({
      runtime,
      context: extractPrompt, 
      modelClass: ModelClass.SMALL,
      stop: ["\n"]
    });

    // Use the extracted word as the guess
    const guess = extractedGuess.toLowerCase().trim();

    elizaLogger.log(`Extracted guess: ${guess}`);
    elizaLogger.log(`Secret word: ${contestState.secretWord}`);

    if (guess === contestState.secretWord) {
      const response = `Correct! The word was "${contestState.secretWord}"! Would you like to play again?`;
      contestState = null; // Reset game
      callback({text: response});
      return;
    }

    callback({text: `Sorry, "${guess}" is not the word I'm thinking of. Keep trying!`});
    return;
  },

  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "My guess is 'chocolate'"
        }
      },
      {
        user: "Tee16Z", 
        content: {
          text: "That's Correct! The word was \"chocolate\"! Would you like to play again?"
        }
      }
    ]
  ]
}; 