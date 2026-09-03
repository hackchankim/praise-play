import { ExtractingView } from "./extracting-view";

export default async function SongExtractingPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;
  return <ExtractingView songId={songId} />;
}
