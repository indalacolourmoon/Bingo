import BingoGame from "./BingoGame"

type PageProps = {
    params: Promise<{ roomId: string }>
    searchParams: Promise<{ player?: string; playerId?: string }>
}

export default async function Page({ params, searchParams }: PageProps) {
    const { roomId } = await params
    const { player, playerId } = await searchParams

    return <BingoGame roomId={roomId} playerName={player} />
}
