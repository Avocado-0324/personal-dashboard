# 个人聚合页 - Personal Dashboard

个人模块化仪表板，将邮件待办、育儿提示、GitHub 活跃度聚合到一个页面。

## 项目状态

**当前版本**：M3 - 育儿 Tips 配置化  
**架构版本**：v0.2 (冻结)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env.local`：

```bash
cp .env.example .env.local
```

#### 获取 Google OAuth 凭证

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 Gmail API：
   - 左侧菜单选择「API 和服务」→「已启用的 API 和服务」
   - 点击「启用 API 和服务」
   - 搜索「Gmail API」并启用
4. 创建 OAuth 客户端 ID：
   - 左侧菜单选择「API 和服务」→「凭据」
   - 点击「创建凭据」→「OAuth 客户端 ID」
   - 应用类型选择「Web 应用」
   - 授权重定向 URI 添加：
     - `http://localhost:3000/api/auth/callback/google` (本地开发)
     - `https://your-domain.com/api/auth/callback/google` (生产环境)
   - 点击「创建」，保存客户端 ID 和客户端密钥

#### 获取 GitHub OAuth 凭证

1. 访问 [GitHub Developer Settings](https://github.com/settings/developers)
2. 点击「OAuth Apps」→「New OAuth App」
3. 填写应用信息：
   - **Application name**：Personal Dashboard (或自定义)
   - **Homepage URL**：`http://localhost:3000` (本地开发)
   - **Authorization callback URL**：
     - `http://localhost:3000/api/auth/callback/github` (本地开发)
     - `https://your-domain.com/api/auth/callback/github` (生产环境)
4. 点击「Register application」
5. 在应用详情页生成 Client Secret
6. 保存 Client ID 和 Client Secret

**权限范围说明**：
- `read:user`：读取用户基本信息
- `user:email`：读取用户邮箱
- 应用会请求访问用户的公开活动记录（commits, PRs, reviews）

#### 配置环境变量

将凭证填入 `.env.local`：

```env
AUTH_SECRET=your-random-secret-here-at-least-32-characters
NEXTAUTH_URL=http://localhost:3000

GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

生成 `AUTH_SECRET`：

```bash
openssl rand -base64 32
```

### 3. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

### 4. 构建生产版本

```bash
npm run build
npm start
```

## 功能模块

当前包含三个模块：

### 1. 邮件待办 (mail-todos) - ✅ M1 真实接入

- **功能**：显示收件箱未读邮件
- **数据源**：Gmail API (只读权限)
- **筛选规则**：仅收件箱未读（`in:inbox is:unread`）
- **显示数量**：最多 5 条
- **权限范围**：`https://www.googleapis.com/auth/gmail.readonly`
- **连接方式**：在设置页面通过 Google OAuth 2.0 连接

### 2. 育儿 Tips (parenting-tips) - ✅ M3 配置化筛选

- **功能**：根据宝宝年龄和关注主题推荐育儿建议
- **数据源**：静态内容池（20 条专业建议）
- **配置项**：
  - 宝宝年龄段：0-6个月 / 6-12个月 / 1-2岁 / 2-3岁 / 3岁以上
  - 关注主题：睡眠 / 喂养 / 玩耍 / 健康 / 情绪（可多选）
- **显示数量**：1-3 条
- **特性**：
  - 未配置时显示通用建议（`personalized: false`）
  - 配置后按年龄段和主题智能筛选（`personalized: true`）
  - 支持「换一批」刷新
  - 筛选后无结果时显示友好提示

### 3. GitHub 活跃度 (github-activity) - ✅ M2 真实接入

- **功能**：显示最近 7 天的代码活动统计
- **数据源**：GitHub REST API
- **统计内容**：提交次数、PR 数量、代码审查次数
- **显示数量**：最多 3 条最近活动
- **权限范围**：`read:user`、`user:email`（仅读取公开活动）
- **连接方式**：在设置页面通过 GitHub OAuth 连接

## 如何添加新模块

### 1. 创建模块目录

在 `modules/` 下创建新的模块目录：

```
modules/
  your-module/
    manifest.ts    # 模块清单
    server.ts      # 服务端数据加载
    ui.tsx         # 卡片 UI 组件
    index.ts       # 导出模块契约
```

### 2. 定义模块清单 (manifest.ts)

```typescript
import type { ModuleManifest } from '@/lib/module-types';

export const manifest: ModuleManifest = {
  id: 'your-module',
  name: '模块名称',
  description: '模块描述',
  version: '0.1.0',
  defaultEnabled: true,
  requires: [], // 依赖的连接器: ['gmail', 'github']
  configKeys: [], // 需要的配置键
  layout: { minWidth: 'full', priority: 40 }, // priority 越小越靠前
};
```

### 3. 实现数据加载 (server.ts)

```typescript
import type { ModuleContext, ModuleLoadResult } from '@/lib/module-types';

export type YourModuleData = {
  // 定义你的数据类型
};

export async function load(ctx: ModuleContext): Promise<ModuleLoadResult<YourModuleData>> {
  // 检查连接器状态
  if (!ctx.connectors.someConnector?.ready) {
    return { status: 'disconnected', connector: 'someConnector' };
  }

  // 加载数据
  const data: YourModuleData = {
    // 你的数据
  };

  return {
    status: 'ok',
    data,
    fetchedAt: new Date().toISOString(),
  };
}
```

### 4. 创建卡片 UI (ui.tsx)

```typescript
'use client';

import type { ModuleLoadResult } from '@/lib/module-types';
import type { YourModuleData } from './server';

type Props = {
  result: ModuleLoadResult<YourModuleData>;
  onRefresh: () => void;
};

export function Card({ result, onRefresh }: Props) {
  // 处理不同的状态
  if (result.status === 'disconnected') {
    return <div>未连接</div>;
  }

  if (result.status === 'error') {
    return <div>错误: {result.message}</div>;
  }

  if (result.status === 'ok') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold">模块名称</h2>
        {/* 你的 UI */}
      </div>
    );
  }

  return null;
}
```

### 5. 导出模块契约 (index.ts)

```typescript
import type { ModuleContract } from '@/lib/module-types';
import { manifest } from './manifest';
import { load } from './server';
import { Card } from './ui';

export const yourModule: ModuleContract = {
  manifest,
  load,
  Card,
};
```

### 6. 注册模块

在 `modules/index.ts` 中注册新模块：

```typescript
import { registerModule } from '@/lib/module-registry';
import { yourModule } from './your-module';

export function initializeModules() {
  // 现有模块...
  registerModule(yourModule);
}
```

### 7. 更新用户设置类型

如果需要新的配置项，在 `lib/module-types.ts` 中更新：

```typescript
export type ModuleId = 'mail-todos' | 'parenting-tips' | 'github-activity' | 'your-module';

export type UserSettings = {
  onboardingCompleted: boolean;
  modules: Record<ModuleId, { enabled: boolean }>;
  config: {
    // 现有配置...
    'your.configKey'?: string;
  };
};
```

## 项目结构

```
/workspace/
├── app/                      # Next.js App Router
│   ├── components/           # 共享组件
│   │   └── ModuleRenderer.tsx
│   ├── settings/             # 设置页面
│   │   └── page.tsx
│   ├── globals.css           # 全局样式
│   ├── layout.tsx            # 根布局
│   └── page.tsx              # 首页
├── docs/                     # 架构文档
│   ├── 架构契约-v0.2-frozen.md
│   └── 架构说明书-v0.1.md
├── lib/                      # 核心库
│   ├── module-registry.ts    # 模块注册表
│   ├── module-types.ts       # 类型定义
│   └── user-settings.ts      # 用户设置管理
├── modules/                  # 模块目录
│   ├── mail-todos/           # 邮件待办模块
│   ├── parenting-tips/       # 育儿提示模块
│   ├── github-activity/      # GitHub活跃度模块
│   └── index.ts              # 模块初始化
├── next.config.ts
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 模块系统架构

### 核心类型

- **ModuleManifest**：模块清单，定义模块的基本信息
- **ModuleContext**：运行时上下文，包含用户设置和连接器状态
- **ModuleLoadResult**：数据加载结果，支持多种状态（ok/error/empty/disconnected/unconfigured）
- **ModuleContract**：模块契约，包含 manifest、load 和 Card

### 模块状态

- `ok`：数据加载成功
- `unconfigured`：模块未配置
- `disconnected`：连接器未就绪
- `empty`：无数据
- `error`：加载失败

### 刷新与缓存

| 模块 | TTL | 特殊行为 |
|------|-----|----------|
| mail-todos | 90s | 卡片刷新按钮 |
| parenting-tips | 5min | 「换一批」bypass 缓存 |
| github-activity | 120s | 卡片刷新按钮 |

## 技术栈

- **框架**：Next.js 15 (App Router)
- **语言**：TypeScript
- **样式**：Tailwind CSS
- **包管理**：npm

## 安全说明

- ✅ 使用已授权的 Gmail/GitHub 连接做只读拉取
- ✅ 本地存储用户偏好（模块开关、育儿配置）
- ❌ 不涉及网银、密码、OTP 等敏感信息
- ❌ 不在客户端暴露 access token
- ❌ 模块之间不直接 import server 代码

## 里程碑

- **M0**：✅ 脚手架 + 三模块 mock 数据 + 基础 UI
- **M1**：✅ mail-todos 接入真实 Gmail API
- **M2**：✅ github-activity 接入真实 GitHub API
- **M3（当前）**：✅ parenting-tips 按年龄段/主题配置化筛选

## 文档

详细架构文档请参阅：

- [架构契约 v0.2 (冻结)](./docs/架构契约-v0.2-frozen.md)
- [架构说明书 v0.1](./docs/架构说明书-v0.1.md)

## License

Private - 个人项目
