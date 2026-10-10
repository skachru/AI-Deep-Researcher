import { fetchOgImage } from "@/lib/tools/ogImage";

export const runtime = "nodejs";

/** GET /api/og?url=… — preview image for a source card. Cached at the edge for a day. */
export async function GET(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!target || target.length > 2000) return Response.json({ image: null }, { status: 400 });
  const image = await fetchOgImage(target).catch(() => null);
  return Response.json(
    { image },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
