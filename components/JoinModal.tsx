import { useState, useEffect } from "react"
import { X } from "lucide-react"

interface JoinModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (username: string) => void
    title?: string
    buttonText?: string
    isPending?: boolean
}

export function JoinModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Join Game",
    buttonText = "Continue",
    isPending = false
}: JoinModalProps) {
    const [username, setUsername] = useState("")

    useEffect(() => {
        if (isOpen) {
            const savedName = localStorage.getItem("bingo_username")
            if (savedName) setUsername(savedName)
        }
    }, [isOpen])

    if (!isOpen) return null

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        const trimmed = username.trim()
        if (trimmed) {
            localStorage.setItem("bingo_username", trimmed)
            onConfirm(trimmed)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-center p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                    <h2 className="font-bold text-zinc-800 dark:text-zinc-200">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"
                        disabled={isPending}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4 relative">
                    {/* Disabler overlay when pending */}
                    {isPending && <div className="absolute inset-0 bg-white/50 dark:bg-zinc-900/50 z-10 rounded-b-2xl" />}

                    <div>
                        <label className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                            Your Display Name
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter your name..."
                            className="w-full rounded-lg border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3 text-zinc-900 dark:text-white focus:border-amber-500 focus:ring-amber-500 shadow-sm"
                            autoFocus
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!username.trim() || isPending}
                        className="w-full h-11 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
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
