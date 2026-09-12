import assert from "node:assert/strict";
import {
  convertBillingUnits,
  convertTokenUnit,
  naturalizeVoiceText,
  prepareVoiceText,
} from "../lib/voice-naturalizer";

const unitCases: Array<{ name: string; input: string; expect: string }> = [
  { name: "/次", input: "Token/次", expect: "Token 每次" },
  { name: "/分钟", input: "2元/分钟", expect: "2元 每分钟" },
  { name: "/小时", input: "10 Token/小时", expect: "10 Token 每小时" },
  { name: "/天", input: "5 Token/天", expect: "5 Token 每天" },
  { name: "/日", input: "100 Token/日", expect: "100 Token 每日" },
  { name: "/月", input: "9.9元/月", expect: "9.9元 每月" },
  { name: "/年", input: "99元/年", expect: "99元 每年" },
];

const tokenUnitCases: Array<{ name: string; input: string; expect: string }> = [
  { name: "5 Token", input: "5 Token", expect: "五个 Token" },
  { name: "10000 Token", input: "10000 Token", expect: "一万个 Token" },
  {
    name: "65536 Token额度",
    input: "65536 Token额度",
    expect: "六万五千五百三十六个 Token额度",
  },
];

const spokenCases: Array<{ name: string; input: string; expect: string }> = [
  {
    name: "轻量通道 Token/次",
    input: "轻量通道 5 Token/次",
    expect: "轻量通道 五个 Token 每次",
  },
  {
    name: "基础套餐 元/月",
    input: "基础套餐 9.9元/月",
    expect: "基础套餐 九块九 每月",
  },
  {
    name: "Token/日",
    input: "100 Token/日",
    expect: "一百个 Token 每日",
  },
];

let failed = 0;

for (const c of unitCases) {
  const got = convertBillingUnits(c.input);
  try {
    assert.equal(got, c.expect);
    console.log(`PASS unit ${c.name}`);
  } catch {
    failed += 1;
    console.error(`FAIL unit ${c.name}`);
    console.error(`  input : ${c.input}`);
    console.error(`  expect: ${c.expect}`);
    console.error(`  got   : ${got}`);
  }
}

for (const c of tokenUnitCases) {
  const got = convertTokenUnit(c.input);
  try {
    assert.equal(got, c.expect);
    console.log(`PASS token ${c.name}`);
    console.log(`  → ${got}`);
  } catch {
    failed += 1;
    console.error(`FAIL token ${c.name}`);
    console.error(`  input : ${c.input}`);
    console.error(`  expect: ${c.expect}`);
    console.error(`  got   : ${got}`);
  }
}

for (const c of spokenCases) {
  const got = prepareVoiceText(c.input);
  try {
    assert.equal(got, c.expect);
    console.log(`PASS spoken ${c.name}`);
    console.log(`  → ${got}`);
  } catch {
    failed += 1;
    console.error(`FAIL spoken ${c.name}`);
    console.error(`  input : ${c.input}`);
    console.error(`  expect: ${c.expect}`);
    console.error(`  got   : ${got}`);
    console.error(`  naturalize: ${naturalizeVoiceText(c.input)}`);
  }
}

const emptyCases: Array<{ name: string; input: string }> = [
  { name: "markdown **", input: "**" },
  { name: "hr ---", input: "---" },
  { name: "emoji", input: "👉" },
  { name: "md link xxx", input: "[链接](xxx)" },
  { name: "buy link", input: "[购买](https://xxx.com)" },
];

for (const c of emptyCases) {
  const got = prepareVoiceText(c.input);
  try {
    assert.equal(got, null);
    console.log(`PASS empty ${c.name}`);
  } catch {
    failed += 1;
    console.error(`FAIL empty ${c.name}`);
    console.error(`  input : ${c.input}`);
    console.error(`  expect: null`);
    console.error(`  got   : ${got}`);
  }
}

const normal = prepareVoiceText("你好，我是Mira AI销售助手");
try {
  assert.ok(normal && normal.includes("你好"));
  assert.ok(normal.includes("Mira"));
  console.log("PASS normal sales hello");
  console.log(`  → ${normal}`);
} catch {
  failed += 1;
  console.error("FAIL normal sales hello");
  console.error(`  got: ${normal}`);
}

if (failed > 0) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
