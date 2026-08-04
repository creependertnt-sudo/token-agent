import { prisma } from "@/lib/db";

export async function listActivePackages() {
  return prisma.tokenPackage.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { tokenAmount: "asc" }],
  });
}

export async function listActiveModels() {
  return prisma.aIModel.findMany({
    where: { active: true },
    include: {
      provider: {
        select: {
          id: true,
          name: true,
          slug: true,
          website: true,
          description: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

export async function listProvidersWithModels() {
  return prisma.aIProvider.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      models: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export function formatPackagesForPrompt(
  packages: Array<{
    name: string;
    tokenAmount: number;
    price: number;
    description: string | null;
  }>,
) {
  if (packages.length === 0) return "（暂无套餐数据，请提示用户稍后重试）";
  return packages
    .map(
      (pkg) =>
        `- ${pkg.name}：${pkg.tokenAmount.toLocaleString()} Token，价格 ¥${pkg.price}${
          pkg.description ? `（${pkg.description}）` : ""
        }`,
    )
    .join("\n");
}

export function formatModelsForPrompt(
  models: Array<{
    name: string;
    description: string | null;
    contextWindow: number | null;
    provider: { name: string };
  }>,
) {
  if (models.length === 0) return "（暂无模型数据，请提示用户稍后重试）";
  return models
    .map((model) => {
      const ctx = model.contextWindow
        ? `，上下文约 ${model.contextWindow.toLocaleString()} tokens`
        : "";
      const desc = model.description ? `。${model.description}` : "";
      return `- ${model.provider.name} / ${model.name}${ctx}${desc}`;
    })
    .join("\n");
}
