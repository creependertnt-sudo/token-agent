import { listActiveModels, listProvidersWithModels } from "@/lib/catalog";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [models, providers] = await Promise.all([
      listActiveModels(),
      listProvidersWithModels(),
    ]);

    return NextResponse.json({
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        website: p.website,
        description: p.description,
        models: p.models.map((m) => ({
          id: m.id,
          name: m.name,
          slug: m.slug,
          description: m.description,
          contextWindow: m.contextWindow,
        })),
      })),
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        slug: m.slug,
        description: m.description,
        contextWindow: m.contextWindow,
        provider: m.provider,
      })),
    });
  } catch (error) {
    console.error("Models API error:", error);
    return NextResponse.json({ error: "获取模型失败。" }, { status: 500 });
  }
}
