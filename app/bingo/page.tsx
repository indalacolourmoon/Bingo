'use client'

import { createRoom, joinRoom } from "@/actions/numbers"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { JoinModal } from "@/components/JoinModal"

export default function BingoLobby() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [roomIdToJoin, setRoomIdToJoin] = useState("")
  const [error, setError] = useState("")
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean, action: 'create' | 'join' }>({ isOpen: false, action: 'create' })

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
    startTransition(async () => {
      if (modalConfig.action === 'create') {
        const { roomId, playerId } = await createRoom(username)
        localStorage.setItem(`bingo_player_${roomId}`, username)
        localStorage.setItem(`bingo_player_id_${roomId}`, playerId)
        router.push(`/bingo/${roomId}?player=${encodeURIComponent(username)}&playerId=${playerId}`)
      } else {
        const result = await joinRoom(roomIdToJoin, username)
        if (result && 'error' in result && result.error) {
          setError(result.error)
          setModalConfig({ ...modalConfig, isOpen: false })
        } else if (result && 'playerId' in result) {
          localStorage.setItem(`bingo_player_${roomIdToJoin}`, username)
          localStorage.setItem(`bingo_player_id_${roomIdToJoin}`, result.playerId as string)
          router.push(`/bingo/${roomIdToJoin}?player=${encodeURIComponent(username)}&playerId=${result.playerId}`)
        }
      }
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-amber-50 gap-6">
      <h1 className="text-4xl font-bold text-amber-600">Bingo Party</h1>

      <div className="bg-white p-8 rounded-xl shadow-lg w-96 space-y-4">

        <div className="pt-2">
          <button
            onClick={() => setModalConfig({ isOpen: true, action: 'create' })}
            disabled={isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded transition-colors"
          >
            {isPending ? "Creating..." : "Create New Room"}
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
            onChange={e => setRoomIdToJoin(e.target.value.toUpperCase())}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-amber-500 focus:ring-amber-500 p-2 border"
            placeholder="e.g. X7Z9A"
          />
          <button
            onClick={handleOpenJoin}
            disabled={isPending}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {isPending ? "Joining..." : "Join Private Room"}
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
