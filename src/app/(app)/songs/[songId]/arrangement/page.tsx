import { ArrangementView } from "./arrangement-view";

export default async function SongArrangementPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;

  return <ArrangementView songId={songId} />;
}
