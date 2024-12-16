import {
    Action,
    Memory,
    State,
    IAgentRuntime,
    HandlerCallback,
    generateText,
    elizaLogger
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
    elizaLogger.log("Generating article for word guessing game...");
    
    const article = await generateText({
      runtime,
      context: `
      Generate a short, interesting article about a random topic.
      Keep it under 300 words and make it engaging.
      Response should be just the article text, no title or metadata.
    `,
      modelClass: "gpt-4o-mini",
      stop: ["\n\n"]
    });

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
      modelClass: "gpt-4o-mini",
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

    return "I've started a new game! I've picked a secret word from an interesting article. Try to guess it! Use 'give hint' for a clue.";
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
      - Use context from the article
      - Make it challenging but fair
      - Keep it short (under 15 words)
      
      Return only the hint, no other text.
    `;

    return await generateText({
      runtime,
      context: hintPrompt,
      modelClass: "gpt-4o-mini",
      stop: ["\n\n"]
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

    const guess = message.content.text.toLowerCase().trim();

    if (guess === contestState.secretWord) {
      const response = `Correct! The word was "${contestState.secretWord}"! Would you like to play again?`;
      contestState = null; // Reset game
      return response;
    }

    return `Sorry, "${guess}" is not the word I'm thinking of. Keep trying!`;
  },

  examples: []
}; 