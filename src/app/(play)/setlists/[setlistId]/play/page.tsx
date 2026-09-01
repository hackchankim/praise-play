import { PlayView } from "./play-view";

export default async function SetlistPlayPage({
  params,
}: {
  params: Promise<{ setlistId: string }>;
}) {
  const { setlistId } = await params;

  return <PlayView setlistId={setlistId} />;
}
