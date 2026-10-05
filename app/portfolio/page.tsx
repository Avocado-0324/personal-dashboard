'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState<'positions' | 'cashflows' | 'snapshots' | 'imports'>('positions');

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      {/* 顶栏 */}
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-gray-400 hover:text-gray-300"
            >
              ← 返回首页
            </Link>
            <h1 className="text-xl font-bold text-gray-100">持仓管理</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Tab 导航 */}
        <div className="mb-6 flex gap-4 border-b border-gray-800">
          <button
            onClick={() => setActiveTab('positions')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'positions'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            持仓
          </button>
          <button
            onClick={() => setActiveTab('cashflows')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'cashflows'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            入出金
          </button>
          <button
            onClick={() => setActiveTab('snapshots')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'snapshots'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            快照历史
          </button>
          <button
            onClick={() => setActiveTab('imports')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'imports'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            导入记录
          </button>
        </div>

        {/* KPI 卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">总资产</p>
            <p className="text-2xl font-bold font-mono text-gray-100">—</p>
          </div>
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">累计盈亏</p>
            <p className="text-2xl font-bold font-mono text-gray-400">—</p>
          </div>
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">年化 XIRR</p>
            <p className="text-2xl font-bold font-mono text-gray-400">—</p>
          </div>
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">现金</p>
            <p className="text-2xl font-bold font-mono text-gray-100">—</p>
          </div>
        </div>

        {/* 内容区 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 主内容 */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl bg-gray-900 border border-gray-800 p-6">
              {activeTab === 'positions' && (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">还没有持仓数据</p>
                  <p className="text-sm text-gray-500">请使用右侧的方式录入数据</p>
                </div>
              )}
              {activeTab === 'cashflows' && (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">还没有入出金记录</p>
                </div>
              )}
              {activeTab === 'snapshots' && (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">还没有快照</p>
                </div>
              )}
              {activeTab === 'imports' && (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">还没有导入记录</p>
                </div>
              )}
            </div>
          </div>

          {/* 侧边栏 - 更新数据 */}
          <div className="space-y-6">
            <div className="rounded-3xl bg-gray-900 border border-gray-800 p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">更新数据</h3>
              
              {/* CSV 导入 */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-300 mb-2">CSV 导入</h4>
                <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-600 transition-colors cursor-pointer">
                  <svg className="w-8 h-8 text-gray-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-400">拖入 SBI CSV</p>
                  <p className="text-xs text-gray-500 mt-1">或点击选择文件</p>
                </div>
              </div>

              {/* 截图说明 */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-300 mb-2">截图识别</h4>
                <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-400">
                  <p className="mb-2">将持仓截图发送至 Grok 私聊</p>
                  <p className="text-xs text-gray-500">确认后自动写入</p>
                </div>
              </div>

              {/* 手动新增 */}
              <button className="w-full px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors">
                ＋ 手动新增
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
