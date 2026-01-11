import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import StylePacksManager from "./style-packs-manager";

export default async function StylePacksPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <StylePacksManager />;
}
