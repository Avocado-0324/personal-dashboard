# 认证修复测试指南

## 前置准备

### 1. 配置环境变量

创建 `.env.local` 文件：

```bash
# NextAuth Configuration
AUTH_SECRET=your-random-secret-at-least-32-characters-long
NEXTAUTH_URL=http://localhost:3000

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# GitHub OAuth App Credentials
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

### 2. 更新 OAuth 应用配置

#### Google OAuth
在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 确认：
- **授权重定向 URI**: `http://localhost:3000/api/auth/callback/google`
- **必需的 Scopes**: 
  - openid
  - email
  - profile
  - https://www.googleapis.com/auth/gmail.readonly

#### GitHub OAuth App
在 [GitHub Developer Settings](https://github.com/settings/developers) 更新：
- **Authorization callback URL**: `http://localhost:3000/api/connect/github/callback`
- **Scopes**: read:user, user:email

### 3. 启动应用

```bash
npm install
npm run dev
```

## 测试场景

### 场景 1: 登录页面和访问控制

#### 测试 1.1: 授权账号登录
1. 访问 http://localhost:3000
2. 应该自动重定向到 `/auth/signin`
3. 点击「用 Google 登录」
4. 使用 `niqinou@gmail.com` 登录
5. ✅ **预期结果**: 成功登录，重定向到首页

#### 测试 1.2: 未授权账号登录
1. 访问 http://localhost:3000/auth/signin
2. 点击「用 Google 登录」
3. 使用其他 Google 账号（非 niqinou@gmail.com）
4. ✅ **预期结果**: 
   - 重定向回 `/auth/signin`
   - 显示红色错误提示「此账号无访问权限」

### 场景 2: Gmail 和 GitHub 独立连接

#### 测试 2.1: 先连接 Gmail，后连接 GitHub
1. 使用 `niqinou@gmail.com` 登录
2. 前往 `/settings`
3. 查看 Gmail 状态：✅ **应显示「已连接」+ 邮箱地址**
4. 点击 GitHub 的「连接」按钮
5. 在 GitHub 授权页面批准访问
6. 回到 `/settings`
7. ✅ **预期结果**: 
   - Gmail: 仍然显示「已连接」
   - GitHub: 显示「已连接」+ `@用户名`
8. 前往首页
9. ✅ **预期结果**: 邮件待办和 GitHub 活跃度卡片都正常显示

#### 测试 2.2: 先连接 GitHub，后重新进入
1. 继续上面的状态（Gmail 和 GitHub 都已连接）
2. 刷新页面
3. ✅ **预期结果**: 
   - Gmail 和 GitHub 仍然保持连接
   - 首页两个卡片都正常显示

#### 测试 2.3: 关闭浏览器后重新打开
1. 完全关闭浏览器
2. 重新打开浏览器，访问 http://localhost:3000
3. ✅ **预期结果**: 
   - 仍然保持登录状态（不需要重新登录）
   - Gmail 和 GitHub 都保持连接
   - 这验证了 Google refresh token 机制

### 场景 3: 断开连接逻辑

#### 测试 3.1: 断开 GitHub
1. 确保 Gmail 和 GitHub 都已连接
2. 前往 `/settings`
3. 点击 GitHub 的「断开」按钮
4. ✅ **预期结果**: 
   - GitHub: 显示「未连接」
   - Gmail: **仍然显示「已连接」**（这是关键！）
   - 用户**没有被登出**
5. 前往首页
6. ✅ **预期结果**: 
   - 邮件待办卡片正常显示
   - GitHub 活跃度显示「未连接 GitHub」状态

#### 测试 3.2: 断开 Gmail
1. 前往 `/settings`
2. 点击 Gmail 的「断开」按钮
3. ✅ **预期结果**: 
   - Gmail: 显示「未连接」
   - GitHub: 仍然显示「已连接」
   - 用户**没有被登出**

### 场景 4: 登出功能

#### 测试 4.1: 完全登出
1. 确保 Gmail 和 GitHub 都已连接
2. 前往 `/settings`
3. 点击右上角的「登出」按钮
4. ✅ **预期结果**: 
   - 重定向到 `/auth/signin`
   - Gmail 和 GitHub 连接都被清除
5. 重新使用 `niqinou@gmail.com` 登录
6. 前往 `/settings`
7. ✅ **预期结果**: Gmail 和 GitHub 都显示「未连接」

### 场景 5: 邮件解析改进

#### 测试 5.1: 正常邮件显示
1. 确保 Gmail 已连接且有未读邮件
2. 访问首页
3. ✅ **预期结果**: 
   - 显示发件人名称（如果邮件包含名称）
   - 显示邮件主题
   - 不显示 "Unknown"

#### 测试 5.2: 无主题邮件
1. 如果收件箱中有无主题的邮件
2. ✅ **预期结果**: 显示「（无主题）」而不是 "(No Subject)"

#### 测试 5.3: 发件人显示
1. 查看邮件列表
2. ✅ **预期结果**: 
   - 有名称的发件人：显示名称（例如："张三"）
   - 只有邮箱的发件人：显示邮箱地址
   - 永远不显示 "Unknown"

### 场景 6: 会话持久化（Refresh Token）

#### 测试 6.1: 长期会话保持
1. 登录并连接 Gmail
2. 等待 5-10 分钟
3. 刷新页面
4. ✅ **预期结果**: 
   - 仍然保持登录状态
   - Gmail 连接正常，能加载邮件
   - 不需要重新授权

#### 测试 6.2: Token 自动刷新
1. 检查浏览器控制台
2. ✅ **预期结果**: 没有 token 过期相关的错误

### 场景 7: 安全性验证

#### 测试 7.1: CSRF 保护
1. 打开浏览器开发者工具，切换到 Network 标签
2. 点击 GitHub 的「连接」按钮
3. 观察重定向到 GitHub 的 URL
4. ✅ **预期结果**: URL 包含 `state=` 参数（随机字符串）
5. 授权成功后回到应用
6. 查看 Cookies
7. ✅ **预期结果**: `github_oauth_state` cookie 应该被删除

#### 测试 7.2: Cookie 安全属性
1. 打开浏览器开发者工具 → Application → Cookies
2. 查看 `pd_github_connection` cookie
3. ✅ **预期结果**: 
   - HttpOnly: ✅
   - SameSite: Lax
   - Secure: ⚠️（仅在生产环境）

#### 测试 7.3: Token 加密
1. 在开发者工具中查看 `pd_github_connection` cookie 的值
2. ✅ **预期结果**: 
   - 是一个 JSON 字符串
   - token 字段是 base64 编码的加密数据，不是明文

## 回归测试

### Parenting Tips 模块（不应受影响）
1. 登录后访问 `/settings`
2. 确保「育儿 Tips」模块已启用
3. 配置年龄段和主题（可选）
4. 访问首页
5. ✅ **预期结果**: 育儿 Tips 卡片正常显示，不受认证改动影响

### 演示模式（不应受影响）
1. 前往 `/settings`
2. 切换演示模式：正常模式 → 断连模式 → 空数据模式
3. ✅ **预期结果**: 所有演示模式正常工作

## 已知限制（不在本 PR 范围内）

- ❌ GitHub 卡片中提交计数与列表不匹配问题（留待下个 PR）
- ℹ️ 首次 Google 登录可能需要额外的授权确认以获取 offline access

## 故障排查

### 问题: "此账号无访问权限"
- **原因**: 使用了非 `niqinou@gmail.com` 的账号
- **解决**: 使用正确的授权账号登录

### 问题: GitHub 连接后立即显示「未连接」
- **原因**: GitHub OAuth App 回调 URL 配置错误
- **解决**: 确认 GitHub OAuth App 设置中的回调 URL 是 `http://localhost:3000/api/connect/github/callback`

### 问题: Gmail 刷新后断开连接
- **原因**: Google OAuth 没有获取到 refresh token
- **解决**: 
  1. 前往 Google 账号设置
  2. 移除此应用的授权
  3. 重新登录（会重新请求 offline access）

### 问题: Token 解密失败
- **原因**: `AUTH_SECRET` 环境变量不一致
- **解决**: 确保 `.env.local` 中的 `AUTH_SECRET` 保持不变且至少 32 个字符

## 成功标准

所有以下条件都应满足：

- ✅ 只有 `niqinou@gmail.com` 可以登录
- ✅ 其他账号显示友好的拒绝提示
- ✅ 连接 Gmail 后连接 GitHub，两者都保持连接
- ✅ 连接 GitHub 后连接 Gmail，两者都保持连接
- ✅ 刷新页面后两个连接都保持
- ✅ 断开 GitHub 不影响 Gmail
- ✅ 断开 Gmail 不影响 GitHub
- ✅ 登出清除所有连接
- ✅ 不显示 "Unknown" 或 "(No Subject)"
- ✅ OAuth state 参数存在且被验证
- ✅ GitHub token 被加密存储
- ✅ Google refresh token 机制生效
