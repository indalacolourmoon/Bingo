'use client'

import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { joinRoom, getAvailableRooms, createBotRoom } from "@/actions/numbers"
import { JoinModal } from "@/components/JoinModal"

export default function Home() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [publicRooms, setPublicRooms] = useState<{ id: string, host: string, playerCount: number }[]>([])
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean, type: 'random' | 'specific' | 'bot', roomId?: string }>({ isOpen: false, type: 'random' })

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const fetchRooms = () => {
      getAvailableRooms().then(setPublicRooms);
    };

    const startPolling = () => {
      if (!interval) {
        fetchRooms(); // Initial fetch
        interval = setInterval(fetchRooms, 10000);
      }
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
      } else {
        startPolling();
      }
    };

    // Initial load
    startPolling();

    // Listen for tab focus/blur
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const executeJoin = (username: string) => {
    setError("")
    startTransition(async () => {
      let targetRoomId = modalConfig.roomId

      if (modalConfig.type === 'random') {
        if (publicRooms.length > 0) {
          const random = publicRooms[Math.floor(Math.random() * publicRooms.length)]
          targetRoomId = random.id
        } else {
          setError("No public rooms available right now. Enter the Lobby to create one!")
          setModalConfig({ ...modalConfig, isOpen: false })
          return
        }
      }

      if (targetRoomId && modalConfig.type !== 'bot') {
        const result = await joinRoom(targetRoomId, username)
        if (result && 'error' in result && result.error) {
          setError(result.error)
          setModalConfig({ ...modalConfig, isOpen: false })
        } else if (result && 'playerId' in result) {
          localStorage.setItem(`bingo_player_${targetRoomId}`, username)
          localStorage.setItem(`bingo_player_id_${targetRoomId}`, result.playerId as string)
          router.push(`/bingo/${targetRoomId}?player=${encodeURIComponent(username)}&playerId=${result.playerId}`)
        }
      } else if (modalConfig.type === 'bot') {
        const result = await createBotRoom(username)
        if (result && result.roomId) {
          localStorage.setItem(`bingo_player_${result.roomId}`, username)
          localStorage.setItem(`bingo_player_id_${result.roomId}`, result.playerId)
          router.push(`/bingo/${result.roomId}?player=${encodeURIComponent(username)}&playerId=${result.playerId}`)
        }
      }
    })
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
              disabled={isPending || publicRooms.length === 0}
              className="w-full h-12 bg-green-500 hover:bg-green-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-bold rounded-lg transition-colors"
            >
              {isPending ? "Loading..." : "Join Random Public Room"}
            </button>

            <button
              onClick={() => setModalConfig({ isOpen: true, type: 'bot' })}
              disabled={isPending}
              className="w-full h-12 bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white font-bold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <Gamepad2 className="w-5 h-5" />
              {isPending ? "Loading..." : "Play with Computer"}
            </button>

            <Link
              href="/bingo"
              className="flex items-center justify-center w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors"
            >
              Create or Join Private Room
            </Link>

            <Link
              href="/how-to-play"
              className="flex items-center justify-center w-full h-12 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700 mt-2"
            >
              How to Play (Rules)
            </Link>
          </div>

          {/* Public Rooms List */}
          {publicRooms.length > 0 && (
            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 text-left">
              <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-3">Available Public Rooms ({publicRooms.length})</h3>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                {publicRooms.map(r => (
                  <div key={r.id} className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div>
                      <span className="font-medium text-zinc-800 dark:text-zinc-200">{r.host}'s Room</span>
                      <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-500 bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{r.playerCount}/2 Players</span>
                    </div>
                    <button
                      onClick={() => setModalConfig({ isOpen: true, type: 'specific', roomId: r.id })}
                      disabled={isPending}
                      className="bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-400 px-4 py-1.5 rounded text-sm font-bold hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors"
                    >
                      Join
                    </button>
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
