'use server'
import { revalidatePath } from "next/cache"
import { updateRoom, generateBoard, checkBoardWin, Room } from "@/lib/bingo"
import { supabaseAdmin as supabase } from "@/lib/supabase"

export async function createRoom(playerName: string) {
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

        if (room.players.length === 0) {
            // No players left -> Close and delete
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

    if (room.players.length === 0) {
        // No one left, close and delete
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
