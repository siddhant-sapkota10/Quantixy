import { PageShell } from "@/components/page-shell";
import { PlaySetup } from "@/components/play-setup";

type PlayPageProps = {
  searchParams: {
    mode?: string;
  };
};

export default function PlayPage({ searchParams }: PlayPageProps) {
  const mode = searchParams.mode === "ai" ? "ai" : "pvp";

  return (
    <PageShell className="flex items-center justify-center">
      <PlaySetup mode={mode} />
    </PageShell>
  );
}
