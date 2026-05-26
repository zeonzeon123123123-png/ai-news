# AI News Daily - AI 新闻日报

每日汇总全球主流媒体最具价值的 AI 新闻，覆盖大模型、AI 应用、芯片算力、具身智能四大板块。

## 板块分类

- **大模型与基础技术**: 涵盖 LLM、基础模型研究、训练技术等
- **AI 应用与产品**: 涵盖 AI 产品发布、应用场景、商业落地等
- **芯片与算力**: 涵盖 GPU、芯片研发、算力基础设施等
- **具身智能与机器人**: 涵盖人形机器人、自动驾驶、智能硬件等

## 数据来源

- 今日头条、央视新闻、36氪、机器之心
- The Verge、TechCrunch、ArXiv、Wired
- Bloomberg、AnandTech、IEEE Spectrum

## 功能特性

- 每日 9:00 自动更新新闻日报
- AI 自动翻译和摘要（通过 GitHub Actions + LLM）
- 支持新闻搜索
- 支持生成周报（自定义时间范围、板块、数量）
- AI 要点摘要（支持按板块或全部新闻生成）
- 前端多模型配置与自动切换

## AI 模型配置

### 方式一：GitHub Secrets（推荐）

在仓库 Settings → Secrets and variables → Actions 中添加以下 3 个 Secrets：

| Secret 名称 | 说明 | 示例 |
|-------------|------|------|
| `LLM_API_KEY` | API 密钥 | `sk-xxx` |
| `LLM_BASE_URL` | API 地址 | `https://openrouter.ai/api/v1` |
| `LLM_MODEL` | 模型 ID | `openai/gpt-4o-mini` |

配置后，GitHub Actions 在抓取新闻时会自动调用 LLM 完成翻译和摘要生成，打开页面即可看到中文新闻和 AI 摘要。

### 方式二：前端高级设置

点击页面右上角齿轮按钮，进入"高级设置"：

1. 点击"添加模型"按钮
2. 填写模型名称、Model ID、API Key、Base URL
3. 保存后即可使用"AI 要点"和"重新翻译"功能

**注意：** 前端配置仅支持允许浏览器跨域调用（CORS）的 API 地址，如 OpenRouter 等。如需使用不支持 CORS 的 API（如 OpenAI、DeepSeek 官方接口），请使用 GitHub Secrets 方式配置。

### 模型自动切换

配置多个模型后，当当前模型调用失败时，系统会自动切换到下一个可用模型，直到所有模型都失败才提示错误。

## 技术栈

- 前端: HTML5 + CSS3 + Vanilla JavaScript
- 自动化: GitHub Actions
- 托管: GitHub Pages

## 访问地址

https://zeonzeon123123123-png.github.io/ai-news