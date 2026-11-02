import type { Metadata } from "next";
import { VuePlanActions } from "./vue-plan-actions";

export const metadata: Metadata = { title: "Plan d’actions" };
export const dynamic = "force-dynamic";

export default function PagePlanActions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <VuePlanActions searchParams={searchParams} />;
}
