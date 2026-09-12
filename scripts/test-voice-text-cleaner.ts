import assert from "node:assert/strict";
import { cleanVoiceText } from "../lib/voice-text-cleaner";

const cases: Array<{ name: string; input: string; expect: string }> = [
  {
    name: "absolute url with query",
    input:
      "👉 [点击购买基础套餐（10,000 Token，¥9.9）](https://example.com/pay?id=123)",
    expect: "点击购买基础套餐（10,000 Token，¥9.9）",
  },
  {
    name: "relative path with spaces",
    input: "[查看订单]( /order/detail/123 )",
    expect: "查看订单",
  },
  {
    name: "bare https",
    input: "访问 https://example.com",
    expect: "访问",
  },
  {
    name: "image markdown removed",
    input: "看这里 ![图片](https://cdn.x/a.png) 结束",
    expect: "看这里 结束",
  },
  {
    name: "buy link relative payment",
    input: "[购买](/payment/order/123)",
    expect: "购买",
  },
];

let failed = 0;
for (const c of cases) {
  const got = cleanVoiceText(c.input);
  try {
    assert.equal(got, c.expect);
    console.log(`PASS ${c.name}`);
    console.log(`  → ${got}`);
  } catch {
    failed += 1;
    console.error(`FAIL ${c.name}`);
    console.error(`  input : ${c.input}`);
    console.error(`  expect: ${c.expect}`);
    console.error(`  got   : ${got}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
