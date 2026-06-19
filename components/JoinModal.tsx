import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface JoinModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (username: string, gridSize: number) => void
    title?: string
    buttonText?: string
    isPending?: boolean
    showModeSelector?: boolean
}

export function JoinModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Join Game",
    buttonText = "Continue",
    isPending = false,
    showModeSelector = false
}: JoinModalProps) {
    const [username, setUsername] = useState("")
    const [gridSize, setGridSize] = useState<number>(5)

    useEffect(() => {
        if (isOpen) {
            const savedName = localStorage.getItem("bingo_username")
            if (savedName) setUsername(savedName)
            setGridSize(5) // Default to 5 when modal opens
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = username.trim()
        if (trimmed) {
            localStorage.setItem("bingo_username", trimmed)
            onConfirm(trimmed, gridSize)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <h2 className="font-bold text-zinc-800 dark:text-zinc-200">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors cursor-pointer"
                        disabled={isPending}
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6 relative">
                    {/* Disabler overlay when pending */}
                    {isPending && <div className="absolute inset-0 bg-white/50 dark:bg-zinc-900/50 z-10 rounded-b-2xl" />}

                    <div className="space-y-2">
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                            Your Display Name
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your name..."
                            className="w-full rounded-lg border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3 text-zinc-900 dark:text-white focus:border-amber-500 focus:ring-amber-500 shadow-sm border"
                            autoFocus
                            required
                        />
                    </div>

                    {showModeSelector && (
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                Choose Game Mode
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { size: 5, label: "5x5", desc: "Classic" },
                                    { size: 6, label: "6x6", desc: "BINGOX" },
                                    { size: 7, label: "7x7", desc: "BINGOHX" }
                                ].map((mode) => {
                                    const isSelected = gridSize === mode.size
                                    return (
                                        <button
                                            key={mode.size}
                                            type="button"
                                            onClick={() => setGridSize(mode.size)}
                                            className={cn(
                                                "flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer select-none",
                                                isSelected 
                                                    ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 shadow-xs scale-102 font-bold" 
                                                    : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50/50"
                                            )}
                                        >
                                            <span className="font-extrabold text-base">{mode.label}</span>
                                            <span className="text-[9px] uppercase font-bold tracking-wider opacity-85 mt-0.5">{mode.desc}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={!username.trim() || isPending}
                        className="w-full h-11 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {isPending && (
                            <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        {buttonText}
                    </button>
                </form>
            </div>
        </div>
    )
}
