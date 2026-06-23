'use client'

import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { Room, Player, generateBoard, getWinInfo, checkBoardWin, getSmartBotMove } from "@/lib/bingo"
import { getBingoSocket } from "@/lib/socket"
import { Check, Copy, RefreshCw, Trophy, User, X, Home, Bot, Trophy as TrophyIcon, Sparkles, Mic, MicOff, Volume2, VolumeX } from "lucide-react"

type BingoGameProps = {
    roomId: string
    playerName?: string
}

export default function BingoGame({ roomId, playerName }: BingoGameProps) {
    const router = useRouter()

    const [room, setRoom] = useState<Room | null | undefined>(undefined)
    const [selectedCell, setSelectedCell] = useState<number | null>(null) // Index of selected cell for swap

    // Setup Phase State
    const [nextNumberToPlace, setNextNumberToPlace] = useState<number>(1)
    const [localBoard, setLocalBoard] = useState<number[] | null>(null)
    const [isDragging, setIsDragging] = useState(false)

    // Countdown timer state
    const [timeLeft, setTimeLeft] = useState<number>(0)

    const [showExitModal, setShowExitModal] = useState(false)
    const [copied, setCopied] = useState(false)

    const [isMuted, setIsMuted] = useState(false)
    const [speakerOn, setSpeakerOn] = useState(true)
    const [opponentMuted, setOpponentMuted] = useState(false)
    const [voiceConnected, setVoiceConnected] = useState(false)
    const [isSpeaking, setIsSpeaking] = useState(false)
    const [opponentSpeaking, setOpponentSpeaking] = useState(false)

    const localStreamRef = useRef<MediaStream | null>(null)
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
    const isMutedRef = useRef(false)
    const audioContextRef = useRef<AudioContext | null>(null)
    const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Keep isMutedRef in sync for speaking detection closure
    useEffect(() => {
        isMutedRef.current = isMuted
    }, [isMuted])

    const handleCopyCode = async () => {
        try {
            await navigator.clipboard.writeText(roomId)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Failed to copy room ID:", err)
        }
    }

    const isMountedRef = useRef(true)
    const roomRef = useRef<Room | null | undefined>(undefined)

    useEffect(() => {
        roomRef.current = room
    }, [room])

    const saveRoom = (updatedRoom: Room) => {
        setRoom(updatedRoom)
        const isBot = new URLSearchParams(window.location.search).get("bot") === "true"
        if (isBot) {
            sessionStorage.setItem(`bingo_room_${roomId}`, JSON.stringify(updatedRoom))
        } else {
            getBingoSocket().emit("updateRoom", updatedRoom)
        }
    }

    // Load local state if it's an offline bot match
    useEffect(() => {
        const isBot = new URLSearchParams(window.location.search).get("bot") === "true"
        if (isBot) {
            const saved = sessionStorage.getItem(`bingo_room_${roomId}`)
            if (saved) {
                setRoom(JSON.parse(saved))
            } else {
                setRoom(null) // room not found
            }
        }
    }, [roomId])

    // --- Socket Connection ---
    useEffect(() => {
        const isBot = new URLSearchParams(window.location.search).get("bot") === "true"
        if (isBot) return; // Do not touch socket at all for bot matches!

        isMountedRef.current = true
        const socket = getBingoSocket()
        socket.connect()

        const playerId = sessionStorage.getItem(`bingo_player_id_${roomId}`) || Math.random().toString(36).substring(7)

        const join = () => {
            socket.emit("joinRoom", {
                roomId,
                player: {
                    id: playerId,
                    name: playerName || "Guest",
                    board: generateBoard(5, true),
                    isReady: false
                }
            })
        }

        if (socket.connected) {
            join()
        }
        socket.on("connect", join)

        socket.on("roomUpdated", (updatedRoom: Room) => {
            if (isMountedRef.current) {
                setRoom(updatedRoom)
            }
        })

        socket.on("joinError", (err: { error: string }) => {
            if (isMountedRef.current) {
                console.error("Socket join error:", err.error)
                setRoom(null)
            }
        })

        socket.on("roomClosed", () => {
            if (isMountedRef.current) {
                router.push('/')
            }
        })

        const handlePageHide = () => {
            if (roomRef.current && roomRef.current.status !== 'finished' && roomRef.current.status !== 'closed') {
                socket.emit("leaveRoom", { roomId, playerId })
            }
        }
        window.addEventListener('pagehide', handlePageHide)

        return () => {
            isMountedRef.current = false
            window.removeEventListener('pagehide', handlePageHide)
            socket.off("connect", join)
            socket.off("roomUpdated")
            socket.off("joinError")
            socket.off("roomClosed")
            if (roomRef.current && roomRef.current.status !== 'finished' && roomRef.current.status !== 'closed') {
                socket.emit("leaveRoom", { roomId, playerId })
            }
            socket.disconnect()
        }
    }, [roomId, playerName])

    const cleanupWebRtc = () => {
        if (speakTimerRef.current) {
            clearTimeout(speakTimerRef.current)
            speakTimerRef.current = null
        }
        if (audioContextRef.current) {
            audioContextRef.current.close()
            audioContextRef.current = null
        }
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop())
            localStreamRef.current = null
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close()
            peerConnectionRef.current = null
        }
        setVoiceConnected(false)
        setOpponentMuted(false)
        setIsSpeaking(false)
        setOpponentSpeaking(false)
    }

    // --- WebRTC Voice Connection ---
    useEffect(() => {
        const isBot = new URLSearchParams(window.location.search).get("bot") === "true"
        if (isBot || !room) return

        const activePlayersCount = room.players.length
        if (activePlayersCount < 2) {
            cleanupWebRtc()
            return
        }

        if (peerConnectionRef.current) return

        const socket = getBingoSocket()
        const currentPlayer = room.players.find((p: Player) => p.name === playerName)
        const opponent = room.players.find((p: Player) => p.name !== playerName)

        if (!currentPlayer || !opponent) return

        const pendingSignals: { type: 'offer' | 'answer' | 'candidate' | 'mute' | 'speaking'; sdp?: string; candidate?: Record<string, unknown> | null; isMuted?: boolean; isSpeaking?: boolean }[] = []

        const initWebRtc = async () => {
            try {
                console.log("Initializing WebRTC Voice Chat...")
                
                let stream: MediaStream
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                })
                } catch (mediaErr: unknown) {
                    console.warn("Microphone access denied or unavailable:", mediaErr)
                    return
                }
                
                localStreamRef.current = stream
                stream.getAudioTracks().forEach(track => {
                    track.enabled = !isMuted
                })

                socket.emit("webrtcSignal", {
                    roomId,
                    signal: { type: "mute", isMuted }
                })

                // Set up speaking detection via AudioContext AnalyserNode
                let wasSpeaking = false
                try {
                    const audioContext = new AudioContext()
                    audioContextRef.current = audioContext
                    const source = audioContext.createMediaStreamSource(stream)
                    const analyser = audioContext.createAnalyser()
                    analyser.fftSize = 256
                    const bufferLength = analyser.frequencyBinCount
                    const dataArray = new Uint8Array(bufferLength)
                    source.connect(analyser)

                    const checkSpeaking = () => {
                        if (!peerConnectionRef.current) return

                        if (isMutedRef.current) {
                            setIsSpeaking(false)
                            if (wasSpeaking) {
                                wasSpeaking = false
                                socket.emit("webrtcSignal", {
                                    roomId,
                                    signal: { type: "speaking", isSpeaking: false }
                                })
                            }
                            speakTimerRef.current = setTimeout(checkSpeaking, 500)
                            return
                        }

                        analyser.getByteFrequencyData(dataArray)
                        const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength
                        const speaking = avg > 15

                        setIsSpeaking(speaking)

                        if (speaking !== wasSpeaking) {
                            wasSpeaking = speaking
                            socket.emit("webrtcSignal", {
                                roomId,
                                signal: { type: "speaking", isSpeaking: speaking }
                            })
                        }

                        speakTimerRef.current = setTimeout(checkSpeaking, 300)
                    }

                    speakTimerRef.current = setTimeout(checkSpeaking, 1000)
                } catch (err) {
                    console.warn("Failed to set up speaking detection:", err)
                }

                const pc = new RTCPeerConnection({
                    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
                })
                peerConnectionRef.current = pc

                stream.getTracks().forEach(track => {
                    pc.addTrack(track, stream)
                })

                pc.ontrack = (event) => {
                    console.log("WebRTC received opponent audio stream")
                    if (remoteAudioRef.current && event.streams[0]) {
                        remoteAudioRef.current.srcObject = event.streams[0]
                        setVoiceConnected(true)
                    }
                }

                pc.onicecandidate = (event) => {
                    if (pc.iceConnectionState !== "closed" && event.candidate) {
                        socket.emit("webrtcSignal", {
                            roomId,
                            signal: { type: "candidate", candidate: event.candidate.toJSON() }
                        })
                    }
                }

                pc.oniceconnectionstatechange = () => {
                    console.log("ICE Connection State changed:", pc.iceConnectionState)
                    if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
                        setVoiceConnected(false)
                    }
                }

                const isInitiator = currentPlayer.id < opponent.id
                if (isInitiator) {
                    console.log("Act as initiator. Creating offer...")
                    const offer = await pc.createOffer()
                    await pc.setLocalDescription(offer)
                    socket.emit("webrtcSignal", {
                        roomId,
                        signal: { type: "offer", sdp: offer.sdp }
                    })
                }

                const processPending = async () => {
                    const currentPc = peerConnectionRef.current
                    if (!currentPc) return
                    while (pendingSignals.length > 0) {
                        const sig = pendingSignals.shift()
                        if (!sig) continue
                        try {
                            if (sig.type === "offer" && sig.sdp) {
                                console.log("Processing queued offer...")
                                await currentPc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: sig.sdp }))
                                const answer = await currentPc.createAnswer()
                                await currentPc.setLocalDescription(answer)
                                socket.emit("webrtcSignal", {
                                    roomId,
                                    signal: { type: "answer", sdp: answer.sdp }
                                })
                            } else if (sig.type === "answer" && sig.sdp) {
                                console.log("Processing queued answer...")
                                await currentPc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: sig.sdp }))
                            } else if (sig.type === "candidate" && sig.candidate) {
                                console.log("Processing queued ICE candidate...")
                                const candInit = sig.candidate as unknown as RTCIceCandidateInit
                                await currentPc.addIceCandidate(new RTCIceCandidate(candInit))
                            }
                        } catch (err: unknown) {
                            console.error("Error processing queued signal:", err)
                        }
                    }
                }
                await processPending()

            } catch (err: unknown) {
                console.error("Failed to initialize WebRTC:", err)
            }
        }

        const handleSignal = async (payload: { signal: { type: 'offer' | 'answer' | 'candidate' | 'mute' | 'speaking'; sdp?: string; candidate?: Record<string, unknown> | null; isMuted?: boolean; isSpeaking?: boolean } }) => {
            const { signal } = payload

            if (signal.type === "mute") {
                setOpponentMuted(!!signal.isMuted)
                return
            }

            if (signal.type === "speaking") {
                setOpponentSpeaking(!!signal.isSpeaking)
                return
            }

            const pc = peerConnectionRef.current
            if (!pc) {
                if (signal.type === "offer" || signal.type === "answer" || signal.type === "candidate") {
                    console.log("Queueing signal because peerConnection is not initialized yet:", signal.type)
                    pendingSignals.push(signal)
                }
                return
            }

            try {
                if (signal.type === "offer" && signal.sdp) {
                    console.log("Received WebRTC offer. Creating answer...")
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: signal.sdp }))
                    const answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    socket.emit("webrtcSignal", {
                        roomId,
                        signal: { type: "answer", sdp: answer.sdp }
                    })
                } else if (signal.type === "answer" && signal.sdp) {
                    console.log("Received WebRTC answer.")
                    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.sdp }))
                } else if (signal.type === "candidate" && signal.candidate) {
                    console.log("Received ICE candidate from opponent.")
                    const candInit = signal.candidate as unknown as RTCIceCandidateInit
                    await pc.addIceCandidate(new RTCIceCandidate(candInit))
                }
            } catch (err: unknown) {
                console.error("Error processing WebRTC signal:", err)
            }
        }

        socket.on("webrtcSignal", handleSignal)
        void initWebRtc()

        return () => {
            socket.off("webrtcSignal", handleSignal)
        }
    }, [room?.players?.length, roomId, playerName])

    useEffect(() => {
        return () => {
            cleanupWebRtc()
        }
    }, [])

    const handleToggleMute = () => {
        const nextMute = !isMuted
        setIsMuted(nextMute)
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !nextMute
            })
        }
        const socket = getBingoSocket()
        socket.emit("webrtcSignal", {
            roomId,
            signal: { type: "mute", isMuted: nextMute }
        })
        // If muting, immediately signal we stopped speaking
        if (nextMute) {
            setIsSpeaking(false)
            socket.emit("webrtcSignal", {
                roomId,
                signal: { type: "speaking", isSpeaking: false }
            })
        }
    }

    const handleToggleSpeaker = () => {
        const next = !speakerOn
        setSpeakerOn(next)
        if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = !next
        }
    }

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

                // If time is up, transition state to playing
                if (diff <= 0) {
                    clearInterval(interval)
                    if (room.isBotMatch || room.players[0]?.name === playerName) {
                        const updatedRoom = { ...room, status: 'playing' as const }
                        saveRoom(updatedRoom)
                    }
                }
            }, 100)
            return () => clearInterval(interval)
        }
    }, [room?.status, room?.startTime, roomId, playerName])

    // --- Bot Turn Logic ---
    useEffect(() => {
        if (!room || room.status !== 'playing' || !room.isBotMatch) return

        const activePlayer = room.players[room.currentPlayerIndex]
        if (activePlayer.id === 'bot') {
            const timer = setTimeout(() => {
                const size = room.gridSize || 5
                const botBoard = activePlayer.board
                const currentList = room.list
                const move = getSmartBotMove(botBoard, currentList, size)

                const newList = [...currentList, move]
                let winner: string | null = null
                let newStatus = room.status

                const winners: string[] = []
                for (const p of room.players) {
                    if (checkBoardWin(p.board, newList, size)) {
                        winners.push(p.name)
                    }
                }

                if (winners.length > 1) {
                    winner = "draw"
                    newStatus = 'finished'
                } else if (winners.length === 1) {
                    winner = winners[0]
                    newStatus = 'finished'
                }

                const nextPlayerIndex = room.currentPlayerIndex === 0 ? 1 : 0

                const updatedRoom = {
                    ...room,
                    list: newList,
                    winner,
                    status: newStatus,
                    currentPlayerIndex: nextPlayerIndex,
                    version: room.version + 1,
                    lastActive: Date.now()
                }

                saveRoom(updatedRoom)
            }, 1500) // 1.5 second artificial delay for realism
            return () => clearTimeout(timer)
        }
    }, [room, roomId])

    // Auto-fix player board size on client side to match the room's gridSize
    useEffect(() => {
        if (!room || room.status !== 'setup') return
        const me = room.players.find((p: Player) => p.name === playerName)
        if (!me) return

        const size = room.gridSize || 5
        const targetCells = size * size
        if (me.board.length !== targetCells) {
            const newBoard = Array(targetCells).fill(0)
            const updatedPlayers = room.players.map(p =>
                p.id === me.id ? { ...p, board: newBoard } : p
            )
            const updatedRoom = {
                ...room,
                players: updatedPlayers,
                version: room.version + 1,
                lastActive: Date.now()
            }
            saveRoom(updatedRoom)
        }
    }, [room, playerName])

    // Sync local board only once when entering setup
    useEffect(() => {
        const me = room?.players?.find((p: Player) => p.name === playerName)
        if (room?.status === 'setup' && me && localBoard === null) {
            setLocalBoard(me.board)
        } else if (room?.status !== 'setup') {
            setLocalBoard(null)
            setSelectedCell(null)
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
            const size = room?.gridSize || 5
            const maxVal = size * size
            let next = 1
            while (board.includes(next)) next++
            setNextNumberToPlace(next <= maxVal ? next : 0)
        }
    }, [room?.status, localBoard, room?.players, playerName, room?.gridSize])


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

        const size = room?.gridSize || 5
        const maxVal = size * size

        let next = 1
        while (currentActiveBoard.includes(next)) next++
        if (next > maxVal) return

        const newBoard = [...currentActiveBoard]
        newBoard[idx] = next

        setLocalBoard(newBoard)

        const updatedPlayers = room.players.map(p =>
            p.id === currentPlayer.id ? { ...p, board: newBoard } : p
        )
        const updatedRoom = {
            ...room,
            players: updatedPlayers,
            version: room.version + 1,
            lastActive: Date.now()
        }
        saveRoom(updatedRoom)
    }

    const onPointerDown = (e: React.PointerEvent, idx: number, num: number) => {
        if (!currentPlayer) return
        if (room?.status === 'playing') {
            const isMyTurn = room.players[room.currentPlayerIndex]?.name === playerName
            if (!isMyTurn || room.list.includes(num)) return

            const size = room.gridSize || 5
            const newList = [...room.list, num]
            let winner: string | null = null
            let newStatus: 'waiting' | 'setup' | 'starting' | 'playing' | 'finished' | 'closed' = room.status

            const winners: string[] = []
            for (const player of room.players) {
                if (checkBoardWin(player.board, newList, size)) {
                    winners.push(player.name)
                }
            }

            if (winners.length > 1) {
                winner = "draw"
                newStatus = 'finished'
            } else if (winners.length === 1) {
                winner = winners[0]
                newStatus = 'finished'
            }

            const nextPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length

            const updatedRoom = {
                ...room,
                list: newList,
                winner,
                status: newStatus,
                currentPlayerIndex: nextPlayerIndex,
                version: room.version + 1,
                lastActive: Date.now()
            }
            saveRoom(updatedRoom)
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
                    const updatedPlayers = room.players.map(p =>
                        p.id === currentPlayer.id ? { ...p, board: newBoard } : p
                    )
                    const updatedRoom = {
                        ...room,
                        players: updatedPlayers,
                        version: room.version + 1,
                        lastActive: Date.now()
                    }
                    saveRoom(updatedRoom)
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
        const size = room?.gridSize || 5
        const newBoard = generateBoard(size)
        setLocalBoard(newBoard)
        setSelectedCell(null)

        const updatedPlayers = room.players.map(p =>
            p.id === currentPlayer.id ? { ...p, board: newBoard } : p
        )
        const updatedRoom = {
            ...room,
            players: updatedPlayers,
            version: room.version + 1,
            lastActive: Date.now()
        }
        saveRoom(updatedRoom)
    }

    const handleClear = () => {
        if (!currentPlayer || currentPlayer.isReady) return
        const size = room?.gridSize || 5
        const newBoard = Array(size * size).fill(0)
        setLocalBoard(newBoard)
        setSelectedCell(null)

        const updatedPlayers = room.players.map(p =>
            p.id === currentPlayer.id ? { ...p, board: newBoard } : p
        )
        const updatedRoom = {
            ...room,
            players: updatedPlayers,
            version: room.version + 1,
            lastActive: Date.now()
        }
        saveRoom(updatedRoom)
    }

    const handleToggleReady = () => {
        if (!currentPlayer || !room) return

        const newBoard = localBoard || currentPlayer.board
        if (newBoard.includes(0)) {
            alert("Board not full")
            return
        }

        setSelectedCell(null)

        const updatedPlayers = room.players.map(p =>
            p.id === currentPlayer.id ? { ...p, isReady: !p.isReady, board: newBoard } : p
        )

        let newStatus = room.status
        let startTime = room.startTime

        if (updatedPlayers.every(p => p.isReady)) {
            newStatus = 'starting'
            startTime = Date.now()
        }

        const updatedRoom = {
            ...room,
            players: updatedPlayers,
            status: newStatus,
            startTime,
            version: room.version + 1,
            lastActive: Date.now()
        }
        setRoom(updatedRoom)
        saveRoom(updatedRoom)
    }

    const handleRestart = () => {
        setSelectedCell(null)
        const size = room?.gridSize || 5
        const updatedPlayers = room.players.map(p => {
            if (p.id === 'bot') {
                return { ...p, board: generateBoard(size), isReady: true }
            } else {
                return { ...p, board: generateBoard(size, true), isReady: false }
            }
        })

        const updatedRoom = {
            ...room,
            list: [],
            winner: null,
            status: 'setup' as const,
            currentPlayerIndex: 0,
            startTime: undefined,
            players: updatedPlayers,
            version: room.version + 1,
            lastActive: Date.now()
        }
        saveRoom(updatedRoom)
    }

    const handleExitDelete = async () => {
        setShowExitModal(false)
        const isBot = new URLSearchParams(window.location.search).get("bot") === "true"
        if (isBot) {
            sessionStorage.removeItem(`bingo_room_${roomId}`)
        } else {
            getBingoSocket().emit("deleteRoom", { roomId })
        }
        router.push('/')
    }

    const handleExitLive = async () => {
        setShowExitModal(false)
        const isBot = new URLSearchParams(window.location.search).get("bot") === "true"
        if (isBot) {
            sessionStorage.removeItem(`bingo_room_${roomId}`)
        } else {
            if (currentPlayer) {
                getBingoSocket().emit("leaveRoom", { roomId, playerId: currentPlayer.id })
            }
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
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">
                            {room.players.length === 2 && !room.isBotMatch ? "End the Game?" : room.isBotMatch ? "Quit Match?" : "Leave Room?"}
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 mb-6">
                            {room.players.length === 2 && !room.isBotMatch
                                ? "You are in an active match. Leaving will end the game and forfeit your match. Are you sure?"
                                : room.isBotMatch
                                    ? "Are you sure you want to quit against the Computer? Your progress will be lost."
                                    : "You are about to leave this active room. If you make it live, it will stay open for others to join."}
                        </p>
                        <div className="flex flex-col gap-3">
                            {room.players.length === 2 && !room.isBotMatch ? (
                                <button
                                    onClick={handleExitLive}
                                    className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded transition-colors"
                                >
                                    Yes, End Game
                                </button>
                            ) : room.isBotMatch ? (
                                <button
                                    onClick={handleExitDelete}
                                    className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 rounded transition-colors"
                                >
                                    Yes, Quit Match
                                </button>
                            ) : (
                                <>
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
                                </>
                            )}
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

            {/* Winner Celebration Modal */}
            {room.status === 'finished' && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center border border-slate-100 dark:border-slate-700/50 animate-in zoom-in duration-300 relative overflow-hidden">
                        {/* Decorative floating shapes */}
                        <div className="absolute -top-10 -left-10 w-24 h-24 bg-amber-500/10 rounded-full blur-xl animate-pulse" />
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-orange-500/10 rounded-full blur-xl animate-pulse" />

                        <div className="relative z-10 flex flex-col items-center">
                            {/* Win/Loss/Draw Icon Header */}
                            {room.winner === "draw" ? (
                                <div className="bg-blue-100 dark:bg-blue-900/50 p-5 rounded-full mb-6">
                                    <TrophyIcon className="w-16 h-16 text-blue-500" />
                                </div>
                            ) : room.winner === playerName ? (
                                <div className="bg-amber-100 dark:bg-amber-900/50 p-5 rounded-full mb-6 relative animate-bounce [animation-duration:3s]">
                                    <TrophyIcon className="w-16 h-16 text-amber-500 animate-pulse" />
                                    <Sparkles className="w-6 h-6 text-amber-400 absolute top-2 right-2 animate-spin [animation-duration:6s]" />
                                </div>
                            ) : (
                                <div className="bg-slate-100 dark:bg-slate-700/50 p-5 rounded-full mb-6">
                                    <TrophyIcon className="w-16 h-16 text-slate-400 dark:text-slate-500" />
                                </div>
                            )}

                            <h2 className="text-4xl font-extrabold tracking-tight mb-2 bg-linear-to-r from-amber-500 to-orange-600 inline-block text-transparent bg-clip-text">
                                {room.winner === "draw" ? "IT'S A DRAW! 🤝" : room.winner === playerName ? "VICTORY! 🎉" : "GAME OVER"}
                            </h2>

                            <p className="text-slate-600 dark:text-slate-300 text-lg mb-6">
                                {room.winner === "draw"
                                    ? `Both players completed ${room.gridSize || 5} lines at the same time!`
                                    : room.winner === playerName
                                        ? `Congratulations! You completed ${room.gridSize || 5} lines first!`
                                        : `${room.winner} won the game. Better luck next time!`}
                            </p>

                            <div className="flex flex-col gap-3 w-full">
                                <button
                                    onClick={handleRestart}
                                    className="w-full bg-linear-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-amber-500/20 active:scale-98 transition-all cursor-pointer"
                                >
                                    Play Again
                                </button>
                                <button
                                    onClick={handleConfirmExit}
                                    className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white font-semibold py-3 rounded-xl active:scale-98 transition-all cursor-pointer"
                                >
                                    Exit to Lobby
                                </button>
                            </div>
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
                    <div className="flex items-center justify-center sm:justify-start gap-2.5">
                        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Room: {roomId}</h1>
                        <button
                            onClick={handleCopyCode}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors shadow-sm flex items-center justify-center group"
                            title="Copy Room ID"
                        >
                            {copied ? (
                                <Check className="w-4.5 h-4.5 text-emerald-500 animate-in zoom-in duration-100" />
                            ) : (
                                <Copy className="w-4.5 h-4.5 group-hover:scale-110 transition-transform" />
                            )}
                        </button>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Player: <span className="font-semibold text-amber-600">{playerName}</span></p>
                    {room.players.length === 2 && !room.isBotMatch && (
                        <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                            {/* Mic toggle */}
                            <button
                                onClick={handleToggleMute}
                                title={isMuted ? "Unmute microphone" : "Mute microphone"}
                                className={cn(
                                    "flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 border cursor-pointer select-none",
                                    isMuted
                                        ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-900/40 dark:text-rose-400"
                                        : voiceConnected && isSpeaking
                                            ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-900/40 dark:text-emerald-400"
                                            : voiceConnected
                                                ? "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:border-blue-900/40 dark:text-blue-400"
                                                : "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:border-blue-900/40 dark:text-blue-400 animate-pulse"
                                )}
                            >
                                {isMuted ? (
                                    <MicOff className="w-4 h-4" />
                                ) : voiceConnected && isSpeaking ? (
                                    <Mic className="w-4 h-4 text-emerald-500" />
                                ) : (
                                    <Mic className="w-4 h-4" />
                                )}
                            </button>
                            {/* Speaker toggle */}
                            <button
                                onClick={handleToggleSpeaker}
                                title={speakerOn ? "Mute audio output" : "Unmute audio output"}
                                className={cn(
                                    "flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 border cursor-pointer select-none",
                                    speakerOn
                                        ? "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/40 dark:border-blue-900/40 dark:text-blue-400"
                                        : "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:border-rose-900/40 dark:text-rose-400"
                                )}
                            >
                                {speakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                            </button>
                        </div>
                    )}
                </div>
                <div className="text-right">
                    <div className={cn("text-xl font-bold px-4 py-2 rounded-full shadow-sm flex items-center gap-3",
                        room.status === 'playing' ? (room.players[room.currentPlayerIndex]?.name === playerName ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200") : "bg-gray-100 dark:bg-slate-800 dark:text-slate-200",
                        room.status === 'starting' && "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200"
                    )}>
                        {getGameStateText()}
                        {(room.status === 'playing' || room.status === 'finished') && room.list.length > 0 && (
                            <span className="w-px h-6 bg-slate-300 dark:bg-slate-700" />
                        )}
                        {(room.status === 'playing' || room.status === 'finished') && room.list.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs uppercase text-slate-400 font-semibold tracking-tighter">Last Called</span>
                                <span className="text-2xl text-amber-600 animate-in slide-in-from-top-2 duration-500">
                                    {room.list[room.list.length - 1]}
                                </span>
                            </div>
                        )}
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
                    <div className="flex flex-col gap-6 w-full lg:w-auto">
                        {/* Progress Header */}
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 flex flex-col items-center gap-3">
                            <div className="flex justify-between w-full items-center px-2">
                                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Progress</span>
                                <span className="text-sm font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded">
                                    {getWinInfo(currentPlayer.board, room.list, room.gridSize || 5).lineCount} / {room.gridSize || 5} Lines
                                </span>
                            </div>

                            {/* B-I-N-G-O Letters */}
                            <div className="flex gap-1.5 sm:gap-2">
                                {(room.gridSize === 6 ? ['B', 'I', 'N', 'G', 'O', 'X'] : room.gridSize === 7 ? ['B', 'I', 'N', 'G', 'O', 'H', 'X'] : ['B', 'I', 'N', 'G', 'O']).map((letter, i) => {
                                    const { lineCount } = getWinInfo(currentPlayer.board, room.list, room.gridSize || 5);
                                    const isLit = lineCount > i;
                                    return (
                                        <div
                                            key={letter}
                                            className={cn(
                                                "flex items-center justify-center rounded-lg font-black transition-all duration-500 shadow-sm border-2",
                                                room.gridSize === 7
                                                    ? "w-8 h-8 sm:w-10 sm:h-10 text-base sm:text-lg"
                                                    : room.gridSize === 6
                                                        ? "w-9 h-9 sm:w-11 sm:h-11 text-lg sm:text-xl"
                                                        : "w-10 h-10 sm:w-12 sm:h-12 text-xl sm:text-2xl",
                                                isLit
                                                    ? "bg-amber-500 text-white border-amber-400 scale-110 shadow-amber-500/50 animate-bounce-short"
                                                    : "bg-slate-100 text-slate-300 border-slate-200 dark:bg-slate-700 dark:text-slate-600 dark:border-slate-600"
                                            )}
                                        >
                                            {letter}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full transition-colors duration-300">
                            <h2 className="text-center font-bold mb-4 text-lg border-b dark:border-slate-600 pb-2 dark:text-white flex items-center justify-center gap-2">
                                <User className="w-5 h-5 text-blue-500" />
                                Your Board
                            </h2>
                            <div className={cn(
                                "grid gap-1.5 sm:gap-2 select-none touch-none",
                                room.gridSize === 6 ? "grid-cols-6" : room.gridSize === 7 ? "grid-cols-7" : "grid-cols-5"
                            )}>
                                {(activeBoard || []).map((num: number, idx: number) => {
                                    const status = getCellStatus(num)
                                    const isSelected = selectedCell === idx
                                    const { winningIndices } = getWinInfo(currentPlayer.board, room.list, room.gridSize || 5)
                                    const isWinningCell = winningIndices.has(idx)

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
                                                "flex items-center justify-center rounded-md font-bold transition-all duration-150 relative overflow-hidden",
                                                // Dynamic sizing based on grid size
                                                room.gridSize === 7
                                                    ? "w-8.5 h-8.5 sm:w-11 sm:h-11 text-sm sm:text-base animate-in zoom-in-95"
                                                    : room.gridSize === 6
                                                        ? "w-10 h-10 sm:w-12 sm:h-12 text-base sm:text-lg animate-in zoom-in-95"
                                                        : "w-12 h-12 sm:w-14 sm:h-14 text-lg sm:text-xl animate-in zoom-in-95",
                                                // Status based styles
                                                status === 'marked' ? (isWinningCell ? "bg-emerald-600 text-white shadow-md ring-2 ring-emerald-300/50" : "bg-red-500 text-white shadow-inner") :
                                                    status === 'empty' ? "bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-400 border-2 border-dashed border-slate-300 dark:border-slate-600" :
                                                        "bg-amber-100 text-amber-900 border-2 border-amber-200 hover:border-amber-400 dark:bg-amber-900/50 dark:text-amber-100 dark:border-amber-800",

                                                // Setup phase specific
                                                room.status === 'setup' && !currentPlayer.isReady && "cursor-pointer",
                                                room.status === 'setup' && isSelected && "ring-4 ring-blue-500 z-10 scale-110 bg-blue-100 dark:bg-blue-900",

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
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-semibold text-gray-700 dark:text-slate-200">{opponent.name}</span>
                                            {opponentMuted ? (
                                                <span className="text-rose-500 dark:text-rose-400 flex items-center gap-0.5" title="Opponent is muted">
                                                    <MicOff className="w-3 h-3" />
                                                    <span className="text-[9px] font-black uppercase">Muted</span>
                                                </span>
                                            ) : opponentSpeaking ? (
                                                <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-0.5 animate-pulse" title="Opponent is speaking">
                                                    <Mic className="w-3 h-3" />
                                                    <span className="text-[9px] font-black uppercase">Speaking...</span>
                                                </span>
                                            ) : voiceConnected ? (
                                                <span className="text-blue-500 dark:text-blue-400 flex items-center gap-0.5" title="Opponent is listening">
                                                    <Mic className="w-3 h-3" />
                                                    <span className="text-[9px] font-black uppercase">Listening</span>
                                                </span>
                                            ) : null}
                                        </div>
                                        {room.status === 'setup' ? (
                                            <span className={cn("text-xs px-2 py-0.5 rounded-full transition-colors", opponent.isReady ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400")}>
                                                {opponent.isReady ? "Ready" : "Preparing"}
                                            </span>
                                        ) : (
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-[10px] font-bold text-amber-600 uppercase">
                                                    {getWinInfo(opponent.board, room.list, room.gridSize || 5).lineCount}/{room.gridSize || 5} Lines
                                                </span>
                                                <div className="flex gap-0.5 mt-0.5">
                                                    {(room.gridSize === 6 ? ['B', 'I', 'N', 'G', 'O', 'X'] : room.gridSize === 7 ? ['B', 'I', 'N', 'G', 'O', 'H', 'X'] : ['B', 'I', 'N', 'G', 'O']).map((l, i) => (
                                                        <div
                                                            key={l}
                                                            className={cn(
                                                                "w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center rounded-[2px] text-[8px] font-black transition-all duration-300",
                                                                getWinInfo(opponent.board, room.list, room.gridSize || 5).lineCount > i
                                                                    ? "bg-amber-500 text-white shadow-sm"
                                                                    : "bg-slate-100 text-slate-300 dark:bg-slate-700 dark:text-slate-500"
                                                            )}
                                                        >
                                                            {l}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
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
                            <p className="font-bold">{room.winner === "draw" ? "It's a Draw!" : "Winner!"}</p>
                            <p>{room.winner === "draw" ? "Both players completed their lines simultaneously!" : `${room.winner} has won the game!`}</p>
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
            <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />
        </div>
    )
}
