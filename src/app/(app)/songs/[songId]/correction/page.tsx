import { CorrectionView } from "./correction-view";

export default async function SongCorrectionPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId } = await params;

  return <CorrectionView songId={songId} />;
}
