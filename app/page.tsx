'use client'

import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getBingoSocket } from "@/lib/socket"
import { generateBoard } from "@/lib/bingo"
import { JoinModal } from "@/components/JoinModal"

function RoomCountdown({ lastActive }: { lastActive: number }) {
  const [timeLeft, setTimeLeft] = useState<number>(0)

  useEffect(() => {
    const calculateTimeLeft = () => {
      const duration = 5 * 60 * 1000 // 5 minutes in ms
      const elapsed = Date.now() - lastActive
      const remaining = Math.max(0, duration - elapsed)
      return Math.floor(remaining / 1000)
    }

    setTimeLeft(calculateTimeLeft())

    const interval = setInterval(() => {
      const rem = calculateTimeLeft()
      setTimeLeft(rem)
      if (rem <= 0) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [lastActive])

  if (timeLeft <= 0) return null

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds

  return (
    <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 rounded-md border border-rose-100 dark:border-rose-900/40 animate-pulse flex items-center gap-1.5 shadow-xs">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
      Expires in {minutes}:{formattedSeconds}
    </span>
  )
}

export default function Home() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const [error, setError] = useState("")
  const [publicRooms, setPublicRooms] = useState<{ id: string, host: string, playerCount: number, lastActive: number }[]>([])
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean, type: 'random' | 'specific' | 'bot', roomId?: string }>({ isOpen: false, type: 'random' })

  useEffect(() => {
    const socket = getBingoSocket()

    const onConnect = () => setIsSocketConnected(true)
    const onDisconnect = () => setIsSocketConnected(false)

    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    socket.on("connect_error", onDisconnect)

    setIsSocketConnected(socket.connected)
    socket.connect()

    socket.on("availableRooms", (rooms: any) => {
      setPublicRooms(rooms)
    })

    socket.emit("getAvailableRooms")

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onDisconnect)
      socket.off("availableRooms")
    }
  }, [])

  const executeJoin = (username: string) => {
    setError("")
    setIsPending(true)
    let targetRoomId = modalConfig.roomId

    if (modalConfig.type === 'random') {
      if (publicRooms.length > 0) {
        const random = publicRooms[Math.floor(Math.random() * publicRooms.length)]
        targetRoomId = random.id
      } else {
        setError("No public rooms available right now. Enter the Lobby to create one!")
        setModalConfig({ ...modalConfig, isOpen: false })
        setIsPending(false)
        return
      }
    }

    if (modalConfig.type === 'bot') {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const playerId = Math.random().toString(36).substring(7)
      const room = {
        id: roomId,
        list: [],
        currentPlayerIndex: 0,
        players: [
          { id: playerId, name: username, board: generateBoard(true), isReady: false },
          { id: 'bot', name: "Computer", board: generateBoard(), isReady: true }
        ],
        winner: null,
        status: 'setup' as const,
        version: 1,
        lastActive: Date.now(),
        isBotMatch: true
      }
      
      // Save locally (does not touch socket)
      sessionStorage.setItem(`bingo_room_${roomId}`, JSON.stringify(room))
      sessionStorage.setItem(`bingo_player_${roomId}`, username)
      sessionStorage.setItem(`bingo_player_id_${roomId}`, playerId)
      router.push(`/bingo/${roomId}?player=${encodeURIComponent(username)}&playerId=${playerId}&bot=true`)
    } else if (targetRoomId) {
      const playerId = Math.random().toString(36).substring(7)
      sessionStorage.setItem(`bingo_player_${targetRoomId}`, username)
      sessionStorage.setItem(`bingo_player_id_${targetRoomId}`, playerId)
      router.push(`/bingo/${targetRoomId}?player=${encodeURIComponent(username)}&playerId=${playerId}`)
    }
    setIsPending(false)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950 px-4 py-10">
      <main className="flex w-full max-w-4xl flex-col items-center justify-center py-10 text-center animate-in fade-in zoom-in duration-700">

        <div className="bg-amber-100 dark:bg-amber-900/40 p-6 rounded-full mb-8 shadow-xl shadow-amber-500/10">
          <Gamepad2 className="w-20 h-20 text-amber-500" strokeWidth={1.5} />
        </div>

        <h1 className="text-6xl sm:text-7xl font-black tracking-tight mb-6 bg-linear-to-r from-amber-500 to-orange-600 inline-block text-transparent bg-clip-text">
          Classic Bingo
        </h1>

        <p className="max-w-xl text-xl leading-8 text-zinc-600 dark:text-zinc-400 mb-8">
          Experience the thrill of real-time multiplayer Bingo. Challenge your friends to be the first to complete 5 lines!
        </p>

        {/* Action Area */}
        <div className="w-full max-w-md bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 space-y-6">
          {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100">{error}</div>}

          <div className="flex flex-col gap-3">
            <button
              onClick={() => setModalConfig({ isOpen: true, type: 'random' })}
              disabled={isPending || !isSocketConnected || publicRooms.length === 0}
              className="w-full h-12 bg-green-500 hover:bg-green-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-bold rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isPending ? "Loading..." : !isSocketConnected ? "Join Random Room (Server Offline)" : "Join Random Public Room"}
            </button>

            <button
              onClick={() => setModalConfig({ isOpen: true, type: 'bot' })}
              disabled={isPending}
              className="w-full h-12 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Gamepad2 className="w-5 h-5" />
              {isPending ? "Loading..." : "Play with Computer"}
            </button>

            {isSocketConnected ? (
              <Link
                href="/bingo"
                className="flex items-center justify-center w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors"
              >
                Create or Join Private Room
              </Link>
            ) : (
              <button
                disabled
                className="w-full h-12 bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 font-bold rounded-lg cursor-not-allowed border border-zinc-200 dark:border-zinc-700"
              >
                Create or Join Private Room (Server Offline)
              </button>
            )}

            <Link
              href="/how-to-play"
              className="flex items-center justify-center w-full h-12 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700 mt-2"
            >
              How to Play (Rules)
            </Link>
          </div>

          {/* Public Rooms List */}
          {publicRooms.length > 0 && isSocketConnected && (
            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 text-left">
              <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3">Available Public Rooms ({publicRooms.length})</h3>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                {publicRooms.map(r => (
                  <div
                    key={r.id}
                    onClick={() => !isPending && setModalConfig({ isOpen: true, type: 'specific', roomId: r.id })}
                    className={`flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-xs active:scale-[0.99] transition-all group select-none ${
                      isPending ? "pointer-events-none opacity-50" : ""
                    }`}
                  >
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">
                        {r.host && r.host !== 'Unknown' ? `${r.host}'s Room` : `Room ${r.id}`}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-500 bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{r.playerCount}/2 Players</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.playerCount === 0 && <RoomCountdown lastActive={r.lastActive} />}
                      <span className="bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 px-4 py-1.5 rounded text-sm font-bold group-hover:bg-amber-500 group-hover:text-white dark:group-hover:bg-amber-500 dark:group-hover:text-white transition-colors duration-200">
                        Join
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <JoinModal
          isOpen={modalConfig.isOpen}
          onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
          onConfirm={executeJoin}
          title={modalConfig.type === 'random' ? "Join Random Room" : modalConfig.type === 'bot' ? "Play vs Computer" : "Join Room"}
          buttonText={modalConfig.type === 'bot' ? "Start Game" : "Join Game"}
          isPending={isPending}
        />

      </main>
    </div>
  );
}
