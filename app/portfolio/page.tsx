'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { calculateXIRR } from '@/modules/portfolio/calculations';

type Account = {
  id: string;
  name: string;
  type: string;
};

type Position = {
  position: any;
  account: any;
  instrument: any;
};

type Data = {
  accounts: Account[];
  positions: Position[];
  snapshots: any[];
  cashBalances?: Array<{
    cash: any;
    account: any;
  }>;
};

type CashFlow = {
  cashFlow: any;
  account: any | null;
};

type Batch = {
  id: string;
  source: string;
  filename: string | null;
  rowCount: number | null;
  status: string;
  createdAt: string;
};

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState<'positions' | 'cashflows' | 'snapshots' | 'imports'>('positions');
  const [data, setData] = useState<Data | null>(null);
  const [cashFlows, setCashFlows] = useState<CashFlow[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 手动录入表单状态
  const [showNewAccountForm, setShowNewAccountForm] = useState(false);
  const [showNewCashFlowForm, setShowNewCashFlowForm] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: '', type: 'tokutei' });
  const [newCashFlow, setNewCashFlow] = useState({
    accountName: '',
    date: new Date().toISOString().split('T')[0],
    direction: 'deposit',
    amountJpy: '',
    note: '',
  });

  // CSV 导入状态
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvAccountName, setCsvAccountName] = useState('');
  const [csvAsOf, setCsvAsOf] = useState(new Date().toISOString().split('T')[0]);
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [csvErrors, setCsvErrors] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadData();
    loadCashFlows();
    loadBatches();
  }, []);

  async function loadData() {
    try {
      const res = await fetch('/api/portfolio/data');
      const json = await res.json();
      if (res.ok) {
        setData(json);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCashFlows() {
    try {
      const res = await fetch('/api/portfolio/cash-flows');
      const json = await res.json();
      if (res.ok) {
        setCashFlows(json.cashFlows || []);
      }
    } catch (error) {
      console.error('Failed to load cash flows:', error);
    }
  }

  async function loadBatches() {
    try {
      const res = await fetch('/api/portfolio/batches');
      const json = await res.json();
      if (res.ok) {
        setBatches(json.batches || []);
      }
    } catch (error) {
      console.error('Failed to load batches:', error);
    }
  }

  async function handleCreateAccount() {
    try {
      const res = await fetch('/api/portfolio/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAccount),
      });
      
      if (res.ok) {
        setShowNewAccountForm(false);
        setNewAccount({ name: '', type: 'tokutei' });
        loadData();
      }
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  }

  async function handleCreateCashFlow() {
    try {
      const res = await fetch('/api/portfolio/cash-flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCashFlow),
      });
      
      if (res.ok) {
        setShowNewCashFlowForm(false);
        setNewCashFlow({
          accountName: '',
          date: new Date().toISOString().split('T')[0],
          direction: 'deposit',
          amountJpy: '',
          note: '',
        });
        loadCashFlows();
      }
    } catch (error) {
      console.error('Failed to create cash flow:', error);
    }
  }

  async function handleCSVDryRun() {
    if (!csvFile || !csvAccountName || !csvAsOf) {
      alert('ファイル、アカウント名、日付を入力してください');
      return;
    }

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('accountName', csvAccountName);
    formData.append('asOf', csvAsOf);

    try {
      const res = await fetch('/api/portfolio/import/csv?dryRun=1', {
        method: 'POST',
        body: formData,
      });
      
      const json = await res.json();
      if (res.ok) {
        setCsvPreview(json.preview);
        setCsvErrors(json.errors || []);
      } else {
        setCsvErrors(json.errors || [{ row: 0, message: json.error }]);
      }
    } catch (error) {
      console.error('CSV dry-run failed:', error);
      alert('CSV プレビューに失敗しました');
    }
  }

  async function handleCSVImport() {
    if (!csvFile || !csvAccountName || !csvAsOf) {
      alert('ファイル、アカウント名、日付を入力してください');
      return;
    }

    setImporting(true);

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('accountName', csvAccountName);
    formData.append('asOf', csvAsOf);

    try {
      const res = await fetch('/api/portfolio/import/csv', {
        method: 'POST',
        body: formData,
      });
      
      const json = await res.json();
      if (res.ok) {
        alert(`インポート完了: ${json.imported} 件`);
        setCsvFile(null);
        setCsvPreview(null);
        setCsvErrors([]);
        loadData();
        loadBatches();
      } else {
        setCsvErrors(json.errors || [{ row: 0, message: json.error }]);
        alert(`インポート失敗: ${json.errors?.length || 0} 件のエラー`);
      }
    } catch (error) {
      console.error('CSV import failed:', error);
      alert('CSV インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  }

  async function handleRevertBatch(batchId: string) {
    if (!confirm('このバッチを撤销しますか？')) return;

    try {
      const res = await fetch(`/api/portfolio/batches/${batchId}/revert`, {
        method: 'POST',
      });
      
      if (res.ok) {
        alert('バッチを撤销しました');
        loadBatches();
        loadData();
      } else {
        const json = await res.json();
        alert(`撤销失败: ${json.error}`);
      }
    } catch (error) {
      console.error('Revert batch failed:', error);
      alert('バッチ撤销に失敗しました');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0b0f] flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    );
  }

  // 计算KPI
  let totalValue = new Decimal(0);
  let totalCash = new Decimal(0);
  
  if (data?.positions) {
    for (const { position, instrument } of data.positions) {
      const qty = new Decimal(position.quantity);
      const price = new Decimal(position.price);
      const fxRateRaw = position.fxRateToJpy;
      const unitBasis = new Decimal(instrument.unitBasis);
      
      // 缺汇率跳过
      if (!fxRateRaw || fxRateRaw === null) continue;
      
      const fxRate = new Decimal(fxRateRaw);
      totalValue = totalValue.plus(qty.times(price).div(unitBasis).times(fxRate));
    }
  }

  // 计算现金余额
  if (data?.cashBalances) {
    for (const { cash } of data.cashBalances) {
      const amount = new Decimal(cash.amount);
      const fxRateRaw = cash.fxRateToJpy;
      
      // 缺汇率跳过
      if (!fxRateRaw || fxRateRaw === null) continue;
      
      const fxRate = new Decimal(fxRateRaw);
      const value = amount.times(fxRate);
      totalCash = totalCash.plus(value);
      totalValue = totalValue.plus(value);
    }
  }
  
  let netContribution = new Decimal(0);
  for (const { cashFlow } of cashFlows) {
    const amount = new Decimal(cashFlow.amountJpy);
    if (cashFlow.direction === 'deposit') {
      netContribution = netContribution.plus(amount);
    } else {
      netContribution = netContribution.minus(amount);
    }
  }

  const pnl = totalValue.minus(netContribution);
  
  // 计算 XIRR
  let xirr: Decimal | null = null;
  if (cashFlows.length > 0 && data?.snapshots && data.snapshots.length > 0) {
    const flows: Array<{ date: Date; amount: Decimal }> = cashFlows.map(({ cashFlow }) => ({
      date: new Date(cashFlow.date),
      amount: cashFlow.direction === 'deposit'
        ? new Decimal(cashFlow.amountJpy).neg()
        : new Decimal(cashFlow.amountJpy),
    }));
    
    // 加上终值
    const latestAsOf = data.snapshots[0].asOf;
    flows.push({
      date: new Date(latestAsOf),
      amount: totalValue,
    });
    
    xirr = calculateXIRR(flows);
  }

  return (
    <div className="min-h-screen bg-[#0a0b0f]">
      {/* 顶栏 */}
      <header className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-gray-300">
              ← 返回首页
            </Link>
            <h1 className="text-xl font-bold text-gray-100">持仓管理</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* KPI 卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">总资产</p>
            <p className="text-2xl font-bold font-mono text-gray-100">
              ¥{totalValue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            </p>
          </div>
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">累计盈亏</p>
            <p className={`text-2xl font-bold font-mono ${pnl.gte(0) ? 'text-lime-400' : 'text-red-400'}`}>
              {pnl.gte(0) ? '+' : ''}¥{pnl.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            </p>
          </div>
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">年化 XIRR</p>
            {xirr ? (
              <p className={`text-2xl font-bold font-mono ${xirr.gte(0) ? 'text-lime-400' : 'text-red-400'}`}>
                {xirr.times(100).toFixed(1)}%
              </p>
            ) : (
              <p className="text-sm text-gray-500">数据不足</p>
            )}
          </div>
          <div className="rounded-2xl bg-gray-900 border border-gray-800 p-4">
            <p className="text-xs text-gray-400 mb-1">现金</p>
            <p className="text-2xl font-bold font-mono text-gray-100">
              ¥{totalCash.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            </p>
          </div>
        </div>

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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 主内容 */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl bg-gray-900 border border-gray-800 p-6">
              {activeTab === 'positions' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">持仓列表</h3>
                  {data?.positions && data.positions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-800 text-gray-400">
                            <th className="text-left py-2">名称</th>
                            <th className="text-left py-2">代码</th>
                            <th className="text-right py-2">数量</th>
                            <th className="text-right py-2">现价</th>
                            <th className="text-right py-2">市值(JPY)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.positions.map((pos, i) => {
                            const value = new Decimal(pos.position.quantity)
                              .times(new Decimal(pos.position.price))
                              .div(new Decimal(pos.instrument.unitBasis))
                              .times(new Decimal(pos.position.fxRateToJpy));
                            
                            return (
                              <tr key={i} className="border-b border-gray-800">
                                <td className="py-3 text-gray-100">{pos.instrument.name}</td>
                                <td className="py-3 text-gray-400">{pos.instrument.symbol}</td>
                                <td className="py-3 text-right font-mono text-gray-100">
                                  {parseFloat(pos.position.quantity).toFixed(2)}
                                </td>
                                <td className="py-3 text-right font-mono text-gray-100">
                                  {parseFloat(pos.position.price).toFixed(2)}
                                </td>
                                <td className="py-3 text-right font-mono text-gray-100">
                                  ¥{value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-gray-400 mb-4">还没有持仓数据</p>
                      <p className="text-sm text-gray-500">请使用右侧的方式录入数据</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'cashflows' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-100">入出金记录</h3>
                    <button
                      onClick={() => setShowNewCashFlowForm(true)}
                      className="px-3 py-1 text-sm bg-cyan-500 text-white rounded hover:bg-cyan-600"
                    >
                      ＋ 新增
                    </button>
                  </div>
                  
                  {showNewCashFlowForm && (
                    <div className="mb-4 p-4 bg-gray-800 rounded-lg">
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="date"
                          value={newCashFlow.date}
                          onChange={(e) => setNewCashFlow({ ...newCashFlow, date: e.target.value })}
                          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100"
                        />
                        <select
                          value={newCashFlow.direction}
                          onChange={(e) => setNewCashFlow({ ...newCashFlow, direction: e.target.value as any })}
                          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100"
                        >
                          <option value="deposit">入金</option>
                          <option value="withdrawal">出金</option>
                        </select>
                        <input
                          type="text"
                          placeholder="金额 (JPY)"
                          value={newCashFlow.amountJpy}
                          onChange={(e) => setNewCashFlow({ ...newCashFlow, amountJpy: e.target.value })}
                          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100"
                        />
                        <input
                          type="text"
                          placeholder="备注"
                          value={newCashFlow.note}
                          onChange={(e) => setNewCashFlow({ ...newCashFlow, note: e.target.value })}
                          className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100"
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleCreateCashFlow}
                          className="px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setShowNewCashFlowForm(false)}
                          className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}

                  {cashFlows.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-800 text-gray-400">
                            <th className="text-left py-2">日期</th>
                            <th className="text-left py-2">类型</th>
                            <th className="text-right py-2">金额(JPY)</th>
                            <th className="text-left py-2">备注</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cashFlows.map(({ cashFlow }, i) => (
                            <tr key={i} className="border-b border-gray-800">
                              <td className="py-3 text-gray-100">{cashFlow.date}</td>
                              <td className="py-3">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  cashFlow.direction === 'deposit' 
                                    ? 'bg-lime-500/10 text-lime-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}>
                                  {cashFlow.direction === 'deposit' ? '入金' : '出金'}
                                </span>
                              </td>
                              <td className="py-3 text-right font-mono text-gray-100">
                                ¥{parseFloat(cashFlow.amountJpy).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                              </td>
                              <td className="py-3 text-gray-400">{cashFlow.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-gray-400">还没有入出金记录</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'snapshots' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">快照历史</h3>
                  {data?.snapshots && data.snapshots.length > 0 ? (
                    <div className="space-y-3">
                      {data.snapshots.map((snapshot, i) => (
                        <div key={i} className="p-3 bg-gray-800 rounded">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-gray-100">{snapshot.asOf}</p>
                              <p className="text-xs text-gray-400">来源: {snapshot.source}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-gray-400">还没有快照</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'imports' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">导入记录</h3>
                  {batches.length > 0 ? (
                    <div className="space-y-3">
                      {batches.map((batch) => (
                        <div key={batch.id} className="p-4 bg-gray-800 rounded">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-gray-100">{batch.filename || '手动录入'}</p>
                              <p className="text-xs text-gray-400">
                                {new Date(batch.createdAt).toLocaleString()} · {batch.rowCount} 行 · {batch.source}
                              </p>
                              <span className={`inline-block mt-2 px-2 py-1 rounded text-xs ${
                                batch.status === 'committed' 
                                  ? 'bg-lime-500/10 text-lime-400'
                                  : 'bg-red-500/10 text-red-400'
                              }`}>
                                {batch.status === 'committed' ? '已提交' : '已撤销'}
                              </span>
                            </div>
                            {batch.status === 'committed' && (
                              <button
                                onClick={() => handleRevertBatch(batch.id)}
                                className="px-3 py-1 text-sm bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                              >
                                撤销
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-gray-400">还没有导入记录</p>
                    </div>
                  )}
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
                <h4 className="text-sm font-medium text-gray-300 mb-3">CSV 导入</h4>
                <div className="space-y-3">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-400
                      file:mr-4 file:py-2 file:px-4
                      file:rounded file:border-0
                      file:text-sm file:font-semibold
                      file:bg-cyan-500 file:text-white
                      hover:file:bg-cyan-600"
                  />
                  <input
                    type="text"
                    placeholder="账户名"
                    value={csvAccountName}
                    onChange={(e) => setCsvAccountName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100"
                  />
                  <input
                    type="date"
                    value={csvAsOf}
                    onChange={(e) => setCsvAsOf(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100"
                  />
                  <button
                    onClick={handleCSVDryRun}
                    disabled={!csvFile}
                    className="w-full px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-50"
                  >
                    プレビュー
                  </button>
                  
                  {csvPreview && (
                    <div className="p-3 bg-gray-800 rounded text-xs">
                      <p className="text-gray-300 mb-2">{csvPreview.length} 行を検出</p>
                      <button
                        onClick={handleCSVImport}
                        disabled={importing || csvErrors.length > 0}
                        className="w-full px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600 disabled:opacity-50"
                      >
                        {importing ? 'インポート中...' : 'インポート'}
                      </button>
                    </div>
                  )}
                  
                  {csvErrors.length > 0 && (
                    <div className="p-3 bg-red-500/10 rounded text-xs">
                      <p className="text-red-400 font-semibold mb-2">エラー:</p>
                      {csvErrors.map((err, i) => (
                        <p key={i} className="text-red-400">
                          第 {err.row} 行: {err.message}
                        </p>
                      ))}
                    </div>
                  )}
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

              {/* 新增账户 */}
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">新增账户</h4>
                {showNewAccountForm ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="账户名"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100"
                    />
                    <select
                      value={newAccount.type}
                      onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-100"
                    >
                      <option value="tokutei">特定</option>
                      <option value="nisa_growth">NISA 成长</option>
                      <option value="nisa_tsumitate">NISA 积立</option>
                      <option value="cash">现金</option>
                      <option value="other">其他</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateAccount}
                        className="flex-1 px-4 py-2 bg-cyan-500 text-white rounded hover:bg-cyan-600"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setShowNewAccountForm(false)}
                        className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewAccountForm(true)}
                    className="w-full px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
                  >
                    ＋ 新增账户
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
