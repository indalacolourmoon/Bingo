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

// Helper: Check for a win (Requires 5 completed lines)
export function checkBoardWin(board: number[], calledNumbers: number[]): boolean {
    if (board.includes(0)) return false // Incomplete board cannot win
    const isMarked = (i: number) => calledNumbers.includes(board[i])

    let completedLines = 0;

    // Rows
    for (let i = 0; i < 5; i++) {
        if ([0, 1, 2, 3, 4].every(offset => isMarked(i * 5 + offset))) completedLines++;
    }
    // Cols
    for (let i = 0; i < 5; i++) {
        if ([0, 1, 2, 3, 4].every(offset => isMarked(offset * 5 + i))) completedLines++;
    }
    // Diagonals
    if ([0, 6, 12, 18, 24].every(i => isMarked(i))) completedLines++;
    if ([4, 8, 12, 16, 20].every(i => isMarked(i))) completedLines++;

    return completedLines >= 5
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
