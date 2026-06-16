export type Player = {
    id: string
    name: string
    board: number[] // 0 means empty
    isReady: boolean
}

export type Room = {
    id: string
    list: number[] // Called numbers
    currentPlayerIndex: number
    players: Player[]
    winner: string | null
    status: 'waiting' | 'setup' | 'starting' | 'playing' | 'finished' | 'closed'
    startTime?: number
    version: number // For long polling / SSE
    lastActive: number // To track idle rooms
    isBotMatch?: boolean
}

// Removed globalThis in-memory state
// We now rely solely on Supabase Postgres

// Helper: Generate a random Bingo board (1-25 shuffled) or empty
export function generateBoard(empty: boolean = false): number[] {
    if (empty) return Array(25).fill(0)
    const numbers = Array.from({ length: 25 }, (_, i) => i + 1)
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    return numbers
}

// Helper: Get detailed win information (completed lines and specific indices)
export function getWinInfo(board: number[], calledNumbers: number[]): { lineCount: number, winningIndices: Set<number> } {
    if (!board || board.length !== 25) return { lineCount: 0, winningIndices: new Set() }

    const isMarked = (i: number) => calledNumbers.includes(board[i])
    const winningIndices = new Set<number>();
    let lineCount = 0;

    const lines = [
        // Rows
        [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
        // Cols
        [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
        // Diagonals
        [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
    ];

    for (const line of lines) {
        if (line.every(idx => isMarked(idx))) {
            lineCount++;
            line.forEach(idx => winningIndices.add(idx));
        }
    }

    return { lineCount, winningIndices };
}

// Helper: Check for a win (Requires 5 completed lines)
export function checkBoardWin(board: number[], calledNumbers: number[]): boolean {
    if (board.includes(0)) return false // Incomplete board cannot win
    const { lineCount } = getWinInfo(board, calledNumbers);
    return lineCount >= 5;
}

export function getSmartBotMove(botBoard: number[], calledNumbers: number[]): number {
    const isMarked = (num: number) => calledNumbers.includes(num);
    const getUnmarkedInLine = (lineIndices: number[]) => lineIndices.filter(i => !isMarked(botBoard[i])).map(i => botBoard[i]);

    let bestMove: number | null = null;
    let minNeeded = 6; // Anything > 5 means no lines found yet

    const lines = [
        // Rows
        [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
        // Cols
        [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
        // Diags
        [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
    ];

    // Find the line that needs the FEWEST numbers to finish (but > 0)
    for (const line of lines) {
        const unmarked = getUnmarkedInLine(line);
        if (unmarked.length > 0 && unmarked.length < minNeeded) {
            minNeeded = unmarked.length;
            bestMove = unmarked[Math.floor(Math.random() * unmarked.length)]; // Random if multiple unmarked in the best line
        } else if (unmarked.length > 0 && unmarked.length === minNeeded) {
            // Coin flip to add variety if multiple lines are tied for best
            if (Math.random() > 0.5) {
                bestMove = unmarked[Math.floor(Math.random() * unmarked.length)];
            }
        }
    }

    // Fallback if something weird happens (e.g., all lines full but game isn't over?) -> Should never happen
    if (bestMove === null) {
        const remaining = botBoard.filter(n => !isMarked(n));
        if (remaining.length > 0) {
            return remaining[Math.floor(Math.random() * remaining.length)];
        }
        return 0;
    }

    return bestMove;
}
