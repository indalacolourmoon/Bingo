'use client'

import { fetchRoom, callNumber, restartGame, updateBoard, toggleReady, deleteRoom, leaveRoomLive } from "@/actions/numbers"
import { cn } from "@/lib/utils"
// import { useRouter } from "next/navigation" 
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition, useRef } from "react"
import { Room, Player, generateBoard } from "@/lib/bingo"
import { supabase } from "@/lib/supabase"

type BingoGameProps = {
    roomId: string
    playerName?: string
}

export default function BingoGame({ roomId, playerName }: BingoGameProps) {
    const router = useRouter()
    const [, startTransition] = useTransition()

    const [room, setRoom] = useState<Room | undefined>(undefined)
    const [selectedCell, setSelectedCell] = useState<number | null>(null) // Index of selected cell for swap

    // Setup Phase State
    const [nextNumberToPlace, setNextNumberToPlace] = useState<number>(1)
    const [localBoard, setLocalBoard] = useState<number[] | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    // Countdown timer state
    const [timeLeft, setTimeLeft] = useState<number>(0)

    const [showExitModal, setShowExitModal] = useState(false)

    const isMountedRef = useRef(true)
    const roomRef = useRef<Room | undefined>(undefined)

    useEffect(() => {
        roomRef.current = room
    }, [room])

    // --- Realtime Connection ---
    useEffect(() => {
        isMountedRef.current = true

        const connectRealtime = () => {
            // Initial fetch to get current state (in case we missed something before connecting)
            fetchRoom(roomId).then(data => {
                if (isMountedRef.current && data) setRoom(data)
            })

            const channel = supabase.channel(`room-${roomId}`)

            channel.on('broadcast', { event: 'update' }, ({ payload }) => {
                if (isMountedRef.current) {
                    setRoom(payload)
                }
            }).subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Connected to Supabase Realtime')
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    console.error(`Supabase Realtime Error (${status})`)
                }
            })

            return channel
        }

        const channel = connectRealtime()

        const handlePageHide = () => {
            const playerId = localStorage.getItem(`bingo_player_id_${roomId}`)
            if (playerId && roomRef.current && roomRef.current.status !== 'finished' && roomRef.current.status !== 'closed') {
                navigator.sendBeacon('/api/leave', JSON.stringify({ roomId, playerId }))
            }
        }
        window.addEventListener('pagehide', handlePageHide)

        return () => {
            isMountedRef.current = false
            window.removeEventListener('pagehide', handlePageHide)
            supabase.removeChannel(channel)
        }
    }, [roomId])

    // Handle BeforeUnload & Closed Room Redirects & Back Button
    useEffect(() => {

        // Before Unload Warning for all non-terminal states
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (room?.status === 'waiting' || room?.status === 'setup' || room?.status === 'playing') {
                e.preventDefault()
                e.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [room?.status, router, showExitModal])

    useEffect(() => {
        // Push a dummy state to history so hitting "back" triggers popstate instead of leaving
        window.history.pushState(null, '', window.location.href)

        const handlePopState = () => {
            const currentRoom = roomRef.current
            // If it's a finished or closed game, just leave.
            if (currentRoom?.status === 'finished' || currentRoom?.status === 'closed') {
                router.push('/')
                return
            }

            // Put the state back so we don't accidentally leave later
            window.history.pushState(null, '', window.location.href)
            setShowExitModal(true)
        }

        window.addEventListener('popstate', handlePopState)
        return () => window.removeEventListener('popstate', handlePopState)
    }, [])


    // Handle Countdown
    useEffect(() => {
        if (room?.status === 'starting' && room.startTime) {
            const interval = setInterval(() => {
                const diff = Math.max(0, Math.ceil((room.startTime! + 5000 - Date.now()) / 1000))
                setTimeLeft(diff)

                // If time is up, trigger a server check to transition state
                if (diff <= 0) {
                    clearInterval(interval)
                    // Call fetchRoom to trigger the lazy state update on server
                    fetchRoom(roomId)
                }
            }, 100)
            return () => clearInterval(interval)
        }
    }, [room?.status, room?.startTime, roomId])

    // Sync local board only once when entering setup
    useEffect(() => {
        const me = room?.players?.find((p: Player) => p.name === playerName)
        if (room?.status === 'setup' && me && localBoard === null) {
            setLocalBoard(me.board)
        } else if (room?.status !== 'setup') {
            setLocalBoard(null)
        }
    }, [room?.status, room?.players, playerName, localBoard])

    // Global pointer up to stop dragging
    useEffect(() => {
        const handlePointerUp = () => setIsDragging(false)
        window.addEventListener('pointerup', handlePointerUp)
        window.addEventListener('pointercancel', handlePointerUp)
        return () => {
            window.removeEventListener('pointerup', handlePointerUp)
            window.removeEventListener('pointercancel', handlePointerUp)
        }
    }, [])

    // Update local state for "next number"
    useEffect(() => {
        if (room?.status === 'setup') {
            const me = room?.players?.find((p: Player) => p.name === playerName)
            const board = localBoard || me?.board || []
            let next = 1
            while (board.includes(next)) next++
            setNextNumberToPlace(next <= 25 ? next : 0)
        }
    }, [room?.status, localBoard, room?.players, playerName])


    if (room === undefined) return <div className="p-10 text-center dark:text-white">Connecting to Game...</div>
    if (room === null) return (
        <div className="p-10 text-center space-y-4 dark:text-white">
            <h2 className="text-2xl font-bold text-red-500">Room Not Found</h2>
            <p>This room does not exist or has expired.</p>
            <button
                onClick={() => router.push('/')}
                className="bg-amber-500 text-white px-4 py-2 rounded hover:bg-amber-600"
            >
                Back to Home
            </button>
        </div>
    )
    if (room?.status === 'closed') return (
        <div className="p-10 text-center space-y-4 dark:text-white">
            <h2 className="text-2xl font-bold text-red-500">Room Closed</h2>
            <p>A player disconnected and the room was closed.</p>
            <button onClick={() => router.push('/')} className="bg-amber-500 text-white px-4 py-2 rounded hover:bg-amber-600">Back to Home</button>
        </div>
    )
    if (!playerName) return <div className="p-10 text-center text-red-500">Player name required. Go back home.</div>

    const currentPlayer = room.players.find((p: Player) => p.name === playerName)
    const opponent = room.players.find((p: Player) => p.name !== playerName)
    const activeBoard = room.status === 'setup' ? (localBoard || currentPlayer?.board) : currentPlayer?.board
    const isBoardFull = activeBoard && !activeBoard.includes(0)

    // --- Actions ---

    const placeNumberAt = (idx: number) => {
        if (!currentPlayer || currentPlayer.isReady || room?.status !== 'setup') return

        const currentActiveBoard = localBoard || currentPlayer.board
        if (currentActiveBoard[idx] !== 0) return

        let next = 1
        while (currentActiveBoard.includes(next)) next++
        if (next > 25) return

        const newBoard = [...currentActiveBoard]
        newBoard[idx] = next

        setLocalBoard(newBoard)

        startTransition(async () => {
            await updateBoard(roomId, currentPlayer.id, newBoard)
        })
    }

    const onPointerDown = (e: React.PointerEvent, idx: number, num: number) => {
        if (!currentPlayer) return
        if (room?.status === 'playing') {
            const isMyTurn = room.players[room.currentPlayerIndex]?.name === playerName
            if (!isMyTurn || room.list.includes(num)) return
            startTransition(async () => { await callNumber(roomId, num) })
            return
        }
        if (room?.status !== 'setup' || currentPlayer.isReady) return

        (e.target as HTMLElement).releasePointerCapture(e.pointerId)

        if (num === 0) {
            setIsDragging(true)
            placeNumberAt(idx)
        } else {
            if (selectedCell === null) {
                setSelectedCell(idx)
            } else {
                if (selectedCell !== idx) {
                    const currentActiveBoard = localBoard || currentPlayer.board
                    const newBoard = [...currentActiveBoard]

                    const temp = newBoard[selectedCell]
                    newBoard[selectedCell] = newBoard[idx]
                    newBoard[idx] = temp

                    setLocalBoard(newBoard)
                    startTransition(async () => {
                        await updateBoard(roomId, currentPlayer.id, newBoard)
                    })
                }
                setSelectedCell(null)
            }
        }
    }

    const onPointerEnter = (idx: number, num: number) => {
        if (isDragging && num === 0) {
            placeNumberAt(idx)
        }
    }

    const handleRandomize = () => {
        if (!currentPlayer || currentPlayer.isReady) return
        // Shuffle full board
        const newBoard = generateBoard()
        setLocalBoard(newBoard)
        startTransition(async () => {
            await updateBoard(roomId, currentPlayer.id, newBoard)
        })
    }

    const handleClear = () => {
        if (!currentPlayer || currentPlayer.isReady) return
        const newBoard = Array(25).fill(0)
        setLocalBoard(newBoard)
        startTransition(async () => {
            await updateBoard(roomId, currentPlayer.id, newBoard)
        })
    }

    const handleToggleReady = () => {
        if (!currentPlayer) return
        startTransition(async () => {
            const res = await toggleReady(roomId, currentPlayer.id, localBoard || currentPlayer.board)
            if (res && 'error' in res) {
                alert(res.error) // Should be "Board not full"
            }
        })
    }

    const handleRestart = () => {
        startTransition(async () => {
            await restartGame(roomId)
        })
    }

    const handleExitDelete = async () => {
        setShowExitModal(false)
        await deleteRoom(roomId)
        router.push('/')
    }

    const handleExitLive = async () => {
        setShowExitModal(false)
        if (currentPlayer) {
            await leaveRoomLive(roomId, currentPlayer.id)
        }
        router.push('/')
    }

    const handleConfirmExit = async () => {
        // If it's a finished or closed game, just leave.
        if (room.status === 'finished' || room.status === 'closed') {
            router.push('/')
            return
        }
        setShowExitModal(true)
    }

    const getCellStatus = (num: number) => {
        if (room.status === 'setup') return num === 0 ? 'empty' : 'filled'
        if (room.status === 'waiting') return 'empty'

        const isCalled = room.list.includes(num)
        if (isCalled) return 'marked'
        return 'unmarked'
    }

    const getGameStateText = () => {
        if (room.status === 'waiting') return "Waiting for opponent..."
        if (room.status === 'setup') return "Setup Board"
        if (room.status === 'starting') return `Starting in ${timeLeft}s`
        if (room.status === 'playing') {
            const isMyTurn = room.players[room.currentPlayerIndex]?.name === playerName
            return isMyTurn ? "YOUR TURN" : `${room.players[room.currentPlayerIndex]?.name}'s Turn`
        }
        if (room.status === 'finished') return "GAME OVER"
        return ""
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center py-6 sm:py-10 relative transition-colors duration-300">
            {/* Exit Modal */}
            {showExitModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in duration-200">
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">Leave Room?</h2>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            You are about to leave this active room. If you make it live, it will stay open for others to join.
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleExitLive}
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 rounded transition-colors"
                            >
                                Make it Live (Keep Room)
                            </button>
                            <button
                                onClick={handleExitDelete}
                                className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded transition-colors"
                            >
                                Delete Room
                            </button>
                            <button
                                onClick={() => setShowExitModal(false)}
                                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white font-semibold py-2 rounded transition-colors mt-2"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Start Countdown Overlay */}
            {room.status === 'starting' && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 p-10 rounded-2xl shadow-2xl text-center animate-in zoom-in duration-300">
                        <h2 className="text-4xl font-bold text-amber-600 mb-4">Game Starting!</h2>
                        <div className="text-8xl font-black text-slate-800 dark:text-white font-mono">{timeLeft}</div>
                    </div>
                </div>
            )}

            <div className="w-full max-w-4xl px-4 flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
                <div className="text-center sm:text-left">
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Room: {roomId}</h1>
                    <p className="text-slate-500 dark:text-slate-400">Player: <span className="font-semibold text-amber-600">{playerName}</span></p>
                </div>
                <div className="text-right">
                    <div className={cn("text-xl font-bold px-4 py-2 rounded-full shadow-sm",
                        room.status === 'playing' ? (room.players[room.currentPlayerIndex]?.name === playerName ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200") : "bg-gray-100 dark:bg-slate-800 dark:text-slate-200",
                        room.status === 'starting' && "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
                    )}>
                        {getGameStateText()}
                    </div>
                    <button
                        onClick={handleConfirmExit}
                        className="mt-4 px-4 py-1.5 text-sm font-semibold text-red-600 bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60 rounded-full transition-colors"
                    >
                        Exit Game
                    </button>
                </div>
            </div>

            {/* Setup Controls */}
            {room.status === 'setup' && currentPlayer && (
                <div className="w-full max-w-4xl px-4 mb-8">
                    <div className="w-full flex flex-col sm:flex-row justify-between items-center bg-blue-50 dark:bg-slate-800 p-4 rounded-lg border border-blue-200 dark:border-slate-700 text-sm shadow-sm gap-4 transition-all">
                        <div className="text-blue-700 dark:text-blue-200 text-center sm:text-left text-base">
                            {isBoardFull
                                ? "Board Full! Swap numbers or click Ready."
                                : `Place number ${nextNumberToPlace} by clicking an empty cell.`}
                        </div>
                        <div className="flex gap-3 flex-wrap justify-center">
                            <button
                                onClick={handleClear}
                                disabled={currentPlayer.isReady}
                                className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded disabled:opacity-50 dark:bg-red-900 dark:text-red-200 transition-colors"
                            >
                                Clear
                            </button>
                            <button
                                onClick={handleRandomize}
                                disabled={currentPlayer.isReady}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 transition-colors"
                            >
                                Randomize
                            </button>
                            <button
                                onClick={handleToggleReady}
                                disabled={!isBoardFull}
                                className={cn(
                                    "px-6 py-2 rounded font-bold transition-all shadow-sm",
                                    currentPlayer.isReady ? "bg-green-500 text-white hover:bg-green-600" : "bg-blue-500 text-white hover:bg-blue-600 disabled:bg-slate-400 disabled:cursor-not-allowed"
                                )}
                            >
                                {currentPlayer.isReady ? "Ready!" : "I'm Ready"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-8 items-start w-full max-w-4xl px-4 relative">

                {/* My Board */}
                {currentPlayer ? (
                    <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full lg:w-auto transition-colors duration-300">
                        <h2 className="text-center font-bold mb-4 text-lg border-b dark:border-slate-600 pb-2 dark:text-white">Your Board</h2>
                        <div className="grid grid-cols-5 gap-2 select-none touch-none">
                            {(activeBoard || []).map((num: number, idx: number) => {
                                const status = getCellStatus(num)
                                const isSelected = selectedCell === idx
                                return (
                                    <button
                                        key={idx}
                                        disabled={
                                            (room.status === 'setup' && currentPlayer.isReady) ||
                                            (room.status === 'playing' && (!room.list.includes(num) && room.players[room.currentPlayerIndex]?.name !== playerName)) ||
                                            (room.status !== 'setup' && room.status !== 'playing')
                                        }
                                        onPointerDown={(e) => onPointerDown(e, idx, num)}
                                        onPointerEnter={() => onPointerEnter(idx, num)}
                                        className={cn(
                                            "w-10 h-10 sm:w-14 sm:h-14 flex items-center justify-center rounded-md font-bold text-lg sm:text-xl transition-all duration-150",
                                            // Status based styles
                                            status === 'marked' ? "bg-red-500 text-white shadow-inner" :
                                                status === 'empty' ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-400 border-2 border-dashed border-slate-300 dark:border-slate-600" :
                                                    "bg-amber-100 text-amber-900 border-2 border-amber-200 hover:border-amber-400 dark:bg-amber-900/50 dark:text-amber-100 dark:border-amber-800",

                                            // Setup phase specific
                                            room.status === 'setup' && !currentPlayer.isReady && "cursor-pointer",
                                            isSelected && "ring-4 ring-blue-500 z-10 scale-110 bg-blue-100 dark:bg-blue-900",

                                            // Game phase specific
                                            room.status === 'playing' && room.players[room.currentPlayerIndex]?.name === playerName && status !== 'marked' && "hover:bg-amber-200 dark:hover:bg-amber-800 hover:scale-105 active:scale-95",
                                            room.status === 'playing' && status !== 'marked' && room.players[room.currentPlayerIndex]?.name !== playerName && "opacity-50 grayscale"
                                        )}
                                    >
                                        {num !== 0 ? num : ""}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="p-10 bg-white dark:bg-slate-800 rounded shadow text-center w-full">You are spectating or not in this room.</div>
                )}

                {/* Game Info / Opponent Status */}
                <div className="w-full lg:w-64 space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow border dark:border-slate-700 transition-colors">
                        <h3 className="font-bold text-gray-500 dark:text-slate-400 text-sm uppercase mb-2">Game Status</h3>
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm dark:text-slate-300">
                                <span>Players:</span>
                                <span className="font-mono">{room.players.length}/2</span>
                            </div>
                            {opponent && (
                                <div className="space-y-1 pt-2 border-t dark:border-slate-700">
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="font-semibold text-gray-700 dark:text-slate-200">{opponent.name}</span>
                                        {room.status === 'setup' ? (
                                            <span className={cn("text-xs px-2 py-0.5 rounded-full transition-colors", opponent.isReady ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400")}>
                                                {opponent.isReady ? "Ready" : "Preparing"}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-500 dark:text-slate-500">Opponent</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        {/* Show opponent board progress? Maybe later */}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Last Called - Enhanced */}
                    <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow border dark:border-slate-700 transition-colors">
                        <h3 className="font-bold text-gray-500 dark:text-slate-400 text-sm uppercase mb-2">Last Called</h3>
                        {room.list.length > 0 ? (
                            <div className="text-center py-4">
                                <div className="text-6xl font-black text-amber-600 dark:text-amber-500 animate-in zoom-in duration-300 font-mono">
                                    {room.list[room.list.length - 1]}
                                </div>
                                <div className="text-xs text-gray-400 mt-2">Previous: {room.list.slice(-4, -1).reverse().join(', ')}</div>
                            </div>
                        ) : (
                            <div className="text-center text-gray-400 py-4 italic">Waiting for start...</div>
                        )}
                    </div>

                    {room.status === 'finished' && (
                        <div className="bg-amber-100 dark:bg-amber-900 border-l-4 border-amber-500 text-amber-700 dark:text-amber-100 p-4 rounded" role="alert">
                            <p className="font-bold">Winner!</p>
                            <p>{room.winner} has won the game!</p>
                            <button
                                onClick={handleRestart}
                                className="mt-2 bg-amber-500 text-white px-3 py-1 rounded hover:bg-amber-600 text-sm shadow-sm transition-colors"
                            >
                                Play Again
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
