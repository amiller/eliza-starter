import {
    Action,
    Memory,
    State,
    IAgentRuntime,
    HandlerCallback,
} from "@ai16z/eliza";
import path from "path";
import fs from "fs";

export default {
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
} as Action; 