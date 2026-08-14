import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-queries";
import { DashboardView } from "./dashboard-view";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getDashboardData(session);
  const firstName = session.user?.name?.split(" ")[0] ?? "Operatore";
  const isAdmin = session.user?.role === "ADMIN";

  return (
    <DashboardView data={data} firstName={firstName} isAdmin={isAdmin} />
  );
}
