import { supabaseAdmin as supabase } from "./supabase"

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
    return lineCount >= 5
}


// Helper: Increment version and Save to Supabase
export async function updateRoom(room: Room): Promise<Room> {
    room.version = (room.version || 0) + 1
    room.lastActive = Date.now()

    // Save state to Supabase Postgres
    // Postgres Changes on the client will handle the notification automatically
    const { error } = await supabase
        .from('rooms')
        .upsert({
            id: room.id,
            data: room,
            last_active: room.lastActive
        })

    if (error) {
        console.error("Error saving room to Supabase:", error)
    }

    return room
}
