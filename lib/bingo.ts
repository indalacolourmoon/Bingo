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
    gridSize?: number // 5 (default), 6, or 7
}

// Removed globalThis in-memory state
// We now rely solely on Supabase Postgres

// Helper: Get winning lines (rows, cols, diagonals) dynamically based on size
export function getLinesForSize(size: number): number[][] {
    const lines: number[][] = []
    
    // Rows
    for (let r = 0; r < size; r++) {
        const row: number[] = []
        for (let c = 0; c < size; c++) {
            row.push(r * size + c)
        }
        lines.push(row)
    }
    
    // Cols
    for (let c = 0; c < size; c++) {
        const col: number[] = []
        for (let r = 0; r < size; r++) {
            col.push(r * size + c)
        }
        lines.push(col)
    }
    
    // Diagonal 1 (Top-Left to Bottom-Right)
    const diag1: number[] = []
    for (let i = 0; i < size; i++) {
        diag1.push(i * size + i)
    }
    lines.push(diag1)
    
    // Diagonal 2 (Top-Right to Bottom-Left)
    const diag2: number[] = []
    for (let i = 0; i < size; i++) {
        diag2.push(i * size + (size - 1 - i))
    }
    lines.push(diag2)
    
    return lines
}

// Helper: Generate a random Bingo board (1 to size*size shuffled) or empty
export function generateBoard(size: number = 5, empty: boolean = false): number[] {
    const totalCells = size * size
    if (empty) return Array(totalCells).fill(0)
    const numbers = Array.from({ length: totalCells }, (_, i) => i + 1)
    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    return numbers
}

// Helper: Get detailed win information (completed lines and specific indices)
export function getWinInfo(board: number[], calledNumbers: number[], size: number = 5): { lineCount: number, winningIndices: Set<number> } {
    const totalCells = size * size
    if (!board || board.length !== totalCells) return { lineCount: 0, winningIndices: new Set() }

    const isMarked = (i: number) => calledNumbers.includes(board[i])
    const winningIndices = new Set<number>();
    let lineCount = 0;

    const lines = getLinesForSize(size)

    for (const line of lines) {
        if (line.every(idx => isMarked(idx))) {
            lineCount++;
            line.forEach(idx => winningIndices.add(idx));
        }
    }

    return { lineCount, winningIndices };
}

// Helper: Check for a win (Requires size completed lines)
export function checkBoardWin(board: number[], calledNumbers: number[], size: number = 5): boolean {
    if (board.includes(0)) return false // Incomplete board cannot win
    const { lineCount } = getWinInfo(board, calledNumbers, size);
    return lineCount >= size;
}

export function getSmartBotMove(botBoard: number[], calledNumbers: number[], size: number = 5): number {
    const isMarked = (num: number) => calledNumbers.includes(num);
    const getUnmarkedInLine = (lineIndices: number[]) => lineIndices.filter(i => !isMarked(botBoard[i])).map(i => botBoard[i]);

    let bestMove: number | null = null;
    let minNeeded = size + 1; // Anything > size means no lines found yet

    const lines = getLinesForSize(size);

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
