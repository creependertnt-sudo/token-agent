import { listActivePackages } from "@/lib/catalog";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const packages = await listActivePackages();
    return NextResponse.json({
      packages: packages.map((item) => ({
        id: item.id,
        key: item.key,
        name: item.name,
        tokenAmount: item.tokenAmount,
        price: item.price,
        description: item.description,
        sortOrder: item.sortOrder,
      })),
    });
  } catch (error) {
    console.error("Packages API error:", error);
    return NextResponse.json({ error: "获取套餐失败。" }, { status: 500 });
  }
}
