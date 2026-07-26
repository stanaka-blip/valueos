import DashboardClient from "@/app/DashboardClient";
import { loadDashboard } from "@/lib/dashboard/loadDashboard";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const data = await loadDashboard({
    preset: params.preset,
    from: params.from,
    to: params.to,
  });

  return <DashboardClient data={data} />;
}
