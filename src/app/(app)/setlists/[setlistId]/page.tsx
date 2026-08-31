import { SetlistView } from "./setlist-view";

export default async function SetlistPage({ params }: { params: Promise<{ setlistId: string }> }) {
  const { setlistId } = await params;

  return <SetlistView setlistId={setlistId} />;
}
