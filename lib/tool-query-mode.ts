/**
 * 纯查询 vs 购买/场景咨询。
 * 只影响 LLM 如何表达 Tool 结果，不改 Sales Decision / 商品卡 / 扣费。
 */

const PURCHASE_OR_SCENE =
  /想买|要买|购买|充值|下单|付款|支付|帮我选|该买|应该买|推荐一个套餐|适合我|高并发|并发\s*api|\d+\s*个人|公司.{0,12}人|团队.{0,8}人/i;

const FACT_QUERY =
  /有什么套餐|套餐有哪些|有哪些套餐|套餐目录|价格表|价格是多少|套餐多少钱|都多少钱|余额多少|我的余额|还有多少\s*token|token\s*还有|买过什么|我的订单|订单记录|我的记录|消费记录|历史订单/i;

export function detectToolQueryMode(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (PURCHASE_OR_SCENE.test(text)) return false;
  return FACT_QUERY.test(text);
}

export const TOOL_QUERY_MODE_GUIDE = `【查询模式 toolQueryMode=true】
本轮是事实查询，不是推销。
- 必须完整展示工具返回的全部结果。问套餐/价格时，把 query_packages 返回的每一档都列出（名称、Token 数量、价格），禁止只报【当前推荐套餐】或转化动作里的那一档。
- 问余额/订单/记录时，按对应工具 JSON 说明，不要改成推销话术。
- 商品卡仍由销售决策系统控制，你不要用「只推荐一档」覆盖查询正文。
- 列完事实后可以补一句：如果告诉我使用场景，我可以帮你选择更适合的套餐。
- 不要把购买链接当成目录的替代品。`;
