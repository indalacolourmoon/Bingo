'use client'

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { getBingoSocket } from "@/lib/socket"
import { generateBoard } from "@/lib/bingo"
import { JoinModal } from "@/components/JoinModal"

export default function BingoLobby() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const [roomIdToJoin, setRoomIdToJoin] = useState("")
  const [error, setError] = useState("")
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean, action: 'create' | 'join' }>({ isOpen: false, action: 'create' })

  useEffect(() => {
    const socket = getBingoSocket()

    const onConnect = () => setIsSocketConnected(true)
    const onDisconnect = () => setIsSocketConnected(false)

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("connect_error", onDisconnect)

    setIsSocketConnected(socket.connected)
    socket.connect()

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onDisconnect)
    }
  }, [])

  const handleOpenJoin = () => {
    if (!roomIdToJoin.trim()) {
      setError("Please enter a room ID first")
      return
    }
    setError("")
    setModalConfig({ isOpen: true, action: 'join' })
  }

  const executeAction = (username: string) => {
    setError("")
    setIsPending(true)
    const socket = getBingoSocket()

    if (modalConfig.action === 'create') {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const playerId = Math.random().toString(36).substring(7)
      
      const room = {
        id: roomId,
        list: [],
        currentPlayerIndex: 0,
        players: [{
          id: playerId,
          name: username,
          board: generateBoard(true), // Start empty
          isReady: false
        }],
        winner: null,
        status: 'waiting' as const,
        version: 1,
        lastActive: Date.now()
      }

      socket.emit("createRoom", room)
      
      sessionStorage.setItem(`bingo_player_${roomId}`, username)
      sessionStorage.setItem(`bingo_player_id_${roomId}`, playerId)
      router.push(`/bingo/${roomId}?player=${encodeURIComponent(username)}&playerId=${playerId}`)
    } else {
      const playerId = Math.random().toString(36).substring(7)
      sessionStorage.setItem(`bingo_player_${roomIdToJoin}`, username)
      sessionStorage.setItem(`bingo_player_id_${roomIdToJoin}`, playerId)
      router.push(`/bingo/${roomIdToJoin}?player=${encodeURIComponent(username)}&playerId=${playerId}`)
    }
    setIsPending(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-amber-50 gap-6">
      <h1 className="text-4xl font-bold text-amber-600">Bingo Party</h1>

      <div className="bg-white p-8 rounded-xl shadow-lg w-96 space-y-4">

        <div className="pt-2">
          <button
            onClick={() => setModalConfig({ isOpen: true, action: 'create' })}
            disabled={isPending || !isSocketConnected}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-300 text-white font-bold py-3 px-4 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isPending ? "Creating..." : !isSocketConnected ? "Create New Room (Server Offline)" : "Create New Room"}
          </button>
        </div>

        <div className="relative flex py-2 items-center">
          <div className="grow border-t border-gray-300"></div>
          <span className="shrink mx-4 text-gray-400">OR</span>
          <div className="grow border-t border-gray-300"></div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Room ID</label>
          <input
            type="text"
            value={roomIdToJoin}
            disabled={!isSocketConnected}
            onChange={e => setRoomIdToJoin(e.target.value.toUpperCase())}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 p-2 border disabled:bg-zinc-100 disabled:text-zinc-400"
            placeholder="e.g. X7Z9A"
          />
          <button
            onClick={handleOpenJoin}
            disabled={isPending || !isSocketConnected}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 text-white font-bold py-2 px-4 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isPending ? "Joining..." : !isSocketConnected ? "Join Private Room (Server Offline)" : "Join Private Room"}
          </button>
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}
      </div>

      <JoinModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        onConfirm={executeAction}
        title={modalConfig.action === 'create' ? "Create New Room" : "Join Private Room"}
        buttonText={modalConfig.action === 'create' ? "Create" : "Join"}
        isPending={isPending}
      />
    </div>
  )
}
