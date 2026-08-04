import {
  buildSalesDecision,
  detectSalesIntent,
} from "../lib/sales-decision";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(detectSalesIntent("套餐多少钱") === "PRICE_QUERY", "price");
assert(detectSalesIntent("和 Coze 有什么区别") === "PRODUCT_COMPARE", "compare");
assert(detectSalesIntent("哪个模型适合我") === "MODEL_SELECT", "select");
assert(detectSalesIntent("我想做一个网站后台") === "TECH_REQUIREMENT", "tech");
assert(detectSalesIntent("我们公司要采购私有化") === "ENTERPRISE_PLAN", "ent");
assert(detectSalesIntent("你好") === "GENERAL_CHAT", "general");

const student = buildSalesDecision("我是学生，偶尔翻译和改文案");
assert(student.customerType === "STUDENT", "student type");
assert(student.recommendation.primary === "LIGHT", "student light");

const dev = buildSalesDecision("我是程序员，要做项目和数据库设计");
assert(dev.recommendation.primary === "STANDARD", "dev standard");

const ent = buildSalesDecision("企业级大型系统架构方案");
assert(ent.recommendation.primary === "PREMIUM", "ent premium");

const vague = buildSalesDecision("我想做一个网站");
assert(vague.readyToRecommend === false || vague.clarifyingQuestions.length > 0, "ask first");

console.log("OK sales-decision");
