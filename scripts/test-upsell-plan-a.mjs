import { runSalesPipeline } from "../lib/sales-pipeline.ts";

const r = await runSalesPipeline("我们需要高并发 API 调用，该怎么规划", {
  userId: "cms61mqfa0000u8j0qgz6pd3b",
  tokenBalance: 1200,
});

const recPkg = r.packageRecommend?.recommendedPackage?.name;
const upPkg = r.packageUpgrade?.recommendedPackageName;
const same = recPkg === upPkg;

console.log("recommendedPackage:", recPkg);
console.log("upgradePackage:", upPkg);
console.log("same package:", same);
console.log("upgrade message:", r.packageUpgrade?.message);
console.log("recommend reason snippet:", r.packageRecommend?.reason.slice(0, 120));

const pure = await runSalesPipeline("套餐多少钱", {
  userId: "cms61mqfa0000u8j0qgz6pd3b",
  tokenBalance: 1200,
});
console.log("pure price upsell:", pure.packageUpgrade);
