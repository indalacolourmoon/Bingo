import { handlePlayerDisconnect } from "@/actions/numbers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const body = await request.text()
        const { roomId, playerId } = JSON.parse(body)

        if (roomId && playerId) {
            await handlePlayerDisconnect(roomId, playerId)
        }

        return NextResponse.json({ success: true })
    } catch (e) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }
}
