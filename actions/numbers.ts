'use server'
import { revalidatePath } from "next/cache"
import { rooms, updateRoom, generateBoard, checkBoardWin } from "@/lib/bingo"

export async function createRoom(playerName: string) {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
    const playerId = Math.random().toString(36).substring(7)
    rooms[roomId] = {
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
    return { roomId, playerId }
}

export async function joinRoom(roomId: string, playerName: string) {
    const room = rooms[roomId]
    if (!room) return { error: "Room not found" }
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
    const room = rooms[roomId]
    if (!room) return null

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
    const room = rooms[roomId]
    if (!room || room.status !== 'setup') return

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
    const room = rooms[roomId]
    if (!room || room.status !== 'setup') return

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
    const room = rooms[roomId]
    if (!room || room.status !== 'playing') return

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
    const room = rooms[roomId]
    if (room) {
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
    const room = rooms[roomId]
    // If room doesn't exist or is already closed, we don't care.
    if (!room || room.status === 'closed') return

    const playerExists = room.players.find(p => p.id === playerId)
    if (playerExists) {
        // Remove the disconnected player
        room.players = room.players.filter(p => p.id !== playerId)

        if (room.players.length === 0) {
            // No players left -> Close and delete
            room.status = 'closed'
            await updateRoom(room)
            setTimeout(() => {
                delete rooms[roomId]
            }, 5000)
        } else {
            if (room.status === 'playing' || room.status === 'starting' || room.status === 'finished') {
                // If the game started, opponent leaving closes the room
                room.status = 'closed'
                await updateRoom(room)
                setTimeout(() => {
                    delete rooms[roomId]
                }, 5000)
            } else {
                // One player remains -> Hard Reset the room back to waiting
                room.status = 'waiting'
                room.list = []
                room.winner = null
                room.currentPlayerIndex = 0
                room.startTime = undefined
                room.players.forEach(p => p.isReady = false)
                await updateRoom(room)
            }
        }
    }
}

export async function getAvailableRooms() {
    // Clean up stale waiting rooms (> 5 mins) before fetching
    const now = Date.now()
    Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId]
        if (room && room.status === 'waiting' && (now - room.lastActive > 5 * 60 * 1000)) {
            delete rooms[roomId] // Prune idle rooms
        }
    })

    const publicRooms = Object.values(rooms)
        .filter(room => room.status === 'waiting')
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
    if (rooms[roomId]) {
        rooms[roomId].status = 'closed'
        await updateRoom(rooms[roomId])
        // Delay deletion briefly to let SSE clients catch the "closed" status
        setTimeout(() => {
            delete rooms[roomId]
        }, 1000)
    }
}

export async function leaveRoomLive(roomId: string, playerId: string) {
    const room = rooms[roomId]
    if (!room) return

    if (room.status === 'waiting' || room.status === 'setup') {
        // Remove the exiting player
        room.players = room.players.filter(p => p.id !== playerId)

        if (room.players.length === 0) {
            // No one left, keep waiting
            room.status = 'waiting'
        } else {
            // One player left, they become the host essentially, waiting for another
            room.status = 'waiting'
            // Reset the remaining player's readiness
            room.players.forEach(p => p.isReady = false)
        }

        await updateRoom(room)
    } else {
        // If it's playing, leaving it live usually means surrendering, or pausing.
        // Let's treat it as disconnecting and closing for the opponent, to avoid weird states.
        room.status = 'closed'
        await updateRoom(room)
        setTimeout(() => {
            delete rooms[roomId]
        }, 1000)
    }
}
