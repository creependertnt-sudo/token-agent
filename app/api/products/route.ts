import { listActivePackages } from "@/lib/catalog";
import { NextResponse } from "next/server";

/** @deprecated 请使用 GET /api/packages；保留兼容旧前端 */
export async function GET() {
  try {
    const packages = await listActivePackages();
    return NextResponse.json({
      products: packages.map((item) => ({
        id: item.id,
        name: item.name,
        tokenAmount: item.tokenAmount,
        price: item.price,
      })),
      packages: packages.map((item) => ({
        id: item.id,
        key: item.key,
        name: item.name,
        tokenAmount: item.tokenAmount,
        price: item.price,
        description: item.description,
      })),
    });
  } catch (error) {
    console.error("Products API error:", error);
    return NextResponse.json({ error: "获取套餐失败。" }, { status: 500 });
  }
}
