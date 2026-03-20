# ModelScope 配置指南

## 快速开始

### 方式1：直接运行示例

```bash
cd ai-town
npx tsx src/example-modelscope.ts
```

### 方式2：使用环境变量

编辑 `.env` 文件：

```bash
LLM_PROVIDER=custom
CUSTOM_API_KEY=ms-ce92cac0-df49-4703-a667-67dd13674fb6
CUSTOM_MODEL=qwen/Qwen2-7B-Instruct
CUSTOM_ENDPOINT=https://api-inference.modelscope.cn/v1/chat/completions
CUSTOM_RESPONSE_PATH=choices[0].message.content
```

然后运行：

```bash
npm run dev
```

## 支持的模型

ModelScope 支持多种模型，你可以在 [ModelScope 模型库](https://modelscope.cn/models) 中找到：

| 模型 | model 名称 |
|------|-----------|
| Qwen2-7B-Instruct | `qwen/Qwen2-7B-Instruct` |
| Qwen2-72B-Instruct | `qwen/Qwen2-72B-Instruct` |
| ChatGLM3-6B | `ZhipuAI/chatglm3-6b` |
| Baichuan2-7B | `baichuan-inc/Baichuan2-7B-Chat` |

## 注意事项

1. **模型可用性**：不是所有模型都可以直接通过 API 调用，需要先在 ModelScope 上部署或申请
2. **API 额度**：确保你的 ModelScope 账户有足够的免费额度或已充值
3. **地区限制**：某些模型可能有地区访问限制

## 测试 API

运行测试脚本检查 API 是否可用：

```bash
npx tsx src/test-modelscope.ts
```

## 故障排查

### 401 错误 - 认证失败
- 检查 API Key 是否正确
- 确认 API Key 没有过期

### 404 错误 - 模型不存在
- 确认模型名称拼写正确
- 检查该模型是否支持 API 调用

### 429 错误 - 请求过于频繁
- 降低请求频率
- 或升级账户额度

## 参考文档

- [ModelScope 推理 API 文档](https://modelscope.cn/docs/inference)
- [ModelScope 模型库](https://modelscope.cn/models)
