'use server'
import { revalidatePath } from "next/cache"
import { updateRoom, generateBoard, checkBoardWin, Room } from "@/lib/bingo"
import { supabaseAdmin as supabase } from "@/lib/supabase"

export async function createBotRoom(playerName: string) {
    // 0. Redundant cleanup sweep to ensure no ghost rooms clutter the DB
    const now = Date.now()
    const fiveMinsAgo = now - 5 * 60 * 1000
    await supabase.from('rooms').delete()
        .or(`data->>status.eq.closed,and(data->>status.eq.waiting,last_active.lt.${fiveMinsAgo})`)

    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    const playerId = Math.random().toString(36).substring(7)

    // Create room with bot pre-filled and humans ready to setup
    const room: Room = {
        id: roomId,
        list: [],
        currentPlayerIndex: 0,
        players: [
            { id: playerId, name: playerName, board: generateBoard(true), isReady: false }, // empty board
            { id: 'bot', name: "Computer", board: generateBoard(), isReady: true } // full randomized board
        ],
        winner: null,
        status: 'setup',
        version: 1,
        lastActive: Date.now(),
        isBotMatch: true
    }
    await updateRoom(room)

    return { roomId, playerId }
}

export async function createRoom(playerName: string) {
    // 0. Redundant cleanup sweep
    const now = Date.now()
    const fiveMinsAgo = now - 5 * 60 * 1000
    await supabase.from('rooms').delete()
        .or(`data->>status.eq.closed,and(data->>status.eq.waiting,last_active.lt.${fiveMinsAgo})`)

    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    const playerId = Math.random().toString(36).substring(7)
    const room: Room = {
        id: roomId,
        list: [],
        currentPlayerIndex: 0,
        players: [{
            id: playerId,
            name: playerName,
            board: generateBoard(true), // Start empty
            isReady: false
        }],
        winner: null,
        status: 'waiting',
        version: 1,
        lastActive: Date.now()
    }
    await updateRoom(room)

    return { roomId, playerId }
}

export async function joinRoom(roomId: string, playerName: string) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (!dbRoom) return { error: "Room not found" }

    const room = dbRoom.data as Room
    if (room.status !== 'waiting') return { error: "Game already started or full" }
    if (room.players.length >= 2) return { error: "Room full" }

    const playerId = Math.random().toString(36).substring(7)
    room.players.push({
        id: playerId,
        name: playerName,
        board: generateBoard(true), // Start empty
        isReady: false
    })

    if (room.players.length === 2) {
        room.status = 'setup'
    }
    await updateRoom(room)

    revalidatePath(`/bingo/${roomId}`)
    return { success: true, playerId }
}

export async function fetchRoom(roomId: string) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (!dbRoom) return null

    const room = dbRoom.data as Room

    // Lazy state transition
    if (room.status === 'starting' && room.startTime) {
        if (Date.now() > room.startTime + 5000) {
            room.status = 'playing'
            await updateRoom(room)
            revalidatePath(`/bingo/${roomId}`)
        }
    }

    return room
}

export async function updateBoard(roomId: string, playerId: string, newBoard: number[]) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (!dbRoom) return

    const room = dbRoom.data as Room
    if (room.status !== 'setup') return

    const player = room.players.find(p => p.id === playerId)
    if (!player) return

    // Allow partial boards (containing 0s) during setup
    if (newBoard.length !== 25) return

    player.board = newBoard
    await updateRoom(room)
    revalidatePath(`/bingo/${roomId}`)
    return room
}

export async function toggleReady(roomId: string, playerId: string, currentBoard?: number[]) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (!dbRoom) return

    const room = dbRoom.data as Room
    if (room.status !== 'setup') return

    const player = room.players.find(p => p.id === playerId)
    if (!player) return

    if (currentBoard && currentBoard.length === 25) {
        player.board = currentBoard
    }

    // Validate board is FULL before Ready
    if (player.board.includes(0)) return { error: "Board not full" }

    player.isReady = !player.isReady

    if (room.players.every(p => p.isReady)) {
        room.status = 'starting'
        room.startTime = Date.now()
    }

    await updateRoom(room)
    revalidatePath(`/bingo/${roomId}`)
    return room
}

function getSmartBotMove(botBoard: number[], calledNumbers: number[]): number {
    const isMarked = (num: number) => calledNumbers.includes(num);
    const getUnmarkedInLine = (lineIndices: number[]) => lineIndices.filter(i => !isMarked(botBoard[i])).map(i => botBoard[i]);

    let bestMove: number | null = null;
    let minNeeded = 6; // Anything config > 5 means no lines found yet

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
        return remaining[Math.floor(Math.random() * remaining.length)];
    }

    return bestMove;
}

export async function triggerBotMove(roomId: string) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (!dbRoom) return

    const room = dbRoom.data as Room
    if (room.status !== 'playing') return

    const activePlayer = room.players[room.currentPlayerIndex]
    // Double check it's actually the bot's turn
    if (activePlayer.id !== 'bot') return

    // Pick a smart number
    const botBoard = activePlayer.board;
    const currentList = room.list;
    const move = getSmartBotMove(botBoard, currentList);

    // Call the number
    room.list.push(move)

    // Check Win for all players
    for (const p of room.players) {
        if (checkBoardWin(p.board, room.list)) {
            room.winner = p.name
            room.status = 'finished'
            await updateRoom(room)
            revalidatePath(`/bingo/${roomId}`)
            return room
        }
    }

    // Switch turns
    room.currentPlayerIndex = room.currentPlayerIndex === 0 ? 1 : 0
    await updateRoom(room)
    revalidatePath(`/bingo/${roomId}`)
    return room
}

export async function callNumber(roomId: string, number: number) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (!dbRoom) return

    const room = dbRoom.data as Room
    if (room.status !== 'playing') return

    if (room.list.includes(number)) return

    room.list.push(number)

    for (const player of room.players) {
        if (checkBoardWin(player.board, room.list)) {
            room.winner = player.name
            room.status = 'finished'
        }
    }

    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length

    await updateRoom(room)
    revalidatePath(`/bingo/${roomId}`)
    return room
}

export async function restartGame(roomId: string) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (dbRoom) {
        const room = dbRoom.data as Room
        room.list = []
        room.winner = null
        room.status = 'setup'
        room.currentPlayerIndex = 0
        room.startTime = undefined
        room.players.forEach(p => {
            p.board = generateBoard(true) // Reset to empty
            p.isReady = false
        })
        await updateRoom(room)
        revalidatePath(`/bingo/${roomId}`)
    }
}

export async function handlePlayerDisconnect(roomId: string, playerId: string) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (!dbRoom) return

    const room = dbRoom.data as Room
    // If room doesn't exist or is already closed, we don't care.
    if (room.status === 'closed') return

    const playerExists = room.players.find(p => p.id === playerId)
    if (playerExists) {
        // Remove the disconnected player
        room.players = room.players.filter(p => p.id !== playerId)

        if (room.players.length === 0 || (room.isBotMatch && room.players.length === 1 && room.players[0].id === 'bot')) {
            // No real players left -> Close and delete
            room.status = 'closed'
            await updateRoom(room)
            await supabase.from('rooms').delete().eq('id', roomId)
        } else {
            // One player remains -> Hard Reset the room back to waiting
            room.status = 'waiting'
            room.list = []
            room.winner = null
            room.currentPlayerIndex = 0
            room.startTime = undefined
            room.players.forEach(p => {
                p.isReady = false
                p.board = generateBoard(true) // Reset board visually
            })
            await updateRoom(room)
        }
    }
}

export async function getAvailableRooms() {
    // Clean up stale waiting rooms (> 5 mins) before fetching
    const now = Date.now()
    const fiveMinsAgo = now - 5 * 60 * 1000

    // Prune idle rooms AND lingering closed rooms synchronously
    await supabase.from('rooms').delete()
        .or(`data->>status.eq.closed,and(data->>status.eq.waiting,last_active.lt.${fiveMinsAgo})`)

    const { data: dbRooms } = await supabase
        .from('rooms')
        .select('data')
        .eq('data->>status', 'waiting')

    const publicRooms = (dbRooms || [])
        .map(r => r.data as Room)
        .map(room => ({
            id: room.id,
            host: room.players[0]?.name || 'Unknown',
            playerCount: room.players.length
        }))

    return publicRooms
}

export async function joinRandomRoom(playerName: string) {
    const availableRooms = await getAvailableRooms()
    if (availableRooms.length === 0) {
        return { error: 'No public rooms available right now. Try creating one!' }
    }

    // Pick a random room
    const randomRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)]

    return await joinRoom(randomRoom.id, playerName)
}

export async function deleteRoom(roomId: string) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()

    if (dbRoom) {
        const room = dbRoom.data as Room
        room.status = 'closed'
        await updateRoom(room)
        // Delete directly. The broadcast happens immediately in updateRoom.
        await supabase.from('rooms').delete().eq('id', roomId)
    }
}

export async function leaveRoomLive(roomId: string, playerId: string) {
    const { data: dbRoom } = await supabase.from('rooms').select('data').eq('id', roomId).single()
    if (!dbRoom) return

    const room = dbRoom.data as Room

    // Remove the exiting player
    room.players = room.players.filter(p => p.id !== playerId)

    if (room.players.length === 0 || (room.isBotMatch && room.players.length === 1 && room.players[0].id === 'bot')) {
        // No real players left, close and delete
        room.status = 'closed'
        await updateRoom(room)
        await supabase.from('rooms').delete().eq('id', roomId)
    } else {
        // One player remains -> Hard Reset the room back to waiting
        room.status = 'waiting'
        room.list = []
        room.winner = null
        room.currentPlayerIndex = 0
        room.startTime = undefined
        room.players.forEach(p => {
            p.isReady = false
            p.board = generateBoard(true) // Reset board visually
        })
        await updateRoom(room)
    }
}
