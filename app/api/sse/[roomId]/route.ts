import { roomEvents, Room } from "@/lib/bingo";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    const { roomId } = await params
    const searchParams = request.nextUrl.searchParams
    const playerId = searchParams.get('playerId')

    // Create a new stream for this client
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder()

            // Define the listener
            const onUpdate = (room: Room) => {
                const data = JSON.stringify(room)
                // SSE format: "data: <payload>\n\n"
                controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }

            // Subscribe to updates for this room
            roomEvents.on(`update:${roomId}`, onUpdate)

            // Send a ping every 30s to keep connection alive
            const pingInterval = setInterval(() => {
                controller.enqueue(encoder.encode(': ping\n\n'))
            }, 30000)

            // Cleanup when stream closes
            request.signal.addEventListener('abort', async () => {
                roomEvents.off(`update:${roomId}`, onUpdate)
                clearInterval(pingInterval)
                controller.close()

                // Trigger disconnect logic if the player drops
                if (playerId) {
                    const { handlePlayerDisconnect } = await import('@/actions/numbers')
                    await handlePlayerDisconnect(roomId, playerId)
                }
            })
        }
    })

    return new NextResponse(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    })
}
