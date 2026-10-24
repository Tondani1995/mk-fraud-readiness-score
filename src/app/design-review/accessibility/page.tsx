import { notFound } from "next/navigation";
import { AccessibilityReview } from "@/components/clarity/AccessibilityReview";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Accessibility review",
  robots: { index: false, follow: false },
};
export default function AccessibilityPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AccessibilityReview />;
}
