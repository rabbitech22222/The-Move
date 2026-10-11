import { getWorkspaceData } from "@/lib/data";
import { authorize, endpoint, ok } from "@/lib/http";
export async function GET() {
  return endpoint(async () => {
    await authorize();
    return ok(await getWorkspaceData());
  });
}
