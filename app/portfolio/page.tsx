'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { calculateXIRR } from '@/modules/portfolio/calculations';
import { getUserSettings } from '@/lib/user-settings';
import { getAllModules } from '@/lib/module-registry';

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
  const [error, setError] = useState<string | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState(true);
  
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<{ message: string; batchId: string } | null>(null);
  
  const [revertConfirm, setRevertConfirm] = useState<string | null>(null);
  
  const [editingFxRate, setEditingFxRate] = useState<{ snapshotId: string; currency: string } | null>(null);
  const [fxRateInput, setFxRateInput] = useState('');
  const [fxRateSaving, setFxRateSaving] = useState(false);
  const [fxRateValidationError, setFxRateValidationError] = useState<string | null>(null);
  const [fxRateSuccess, setFxRateSuccess] = useState<{ currency: string; count: number } | null>(null);
  
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

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvAsOf, setCsvAsOf] = useState(new Date().toISOString().split('T')[0]);
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [csvErrors, setCsvErrors] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [csvValidationError, setCsvValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const settings = getUserSettings();
    const allModules = getAllModules();
    const portfolioModule = allModules.find(m => m.manifest.id === 'portfolio');
    const userPref = settings.modules['portfolio'];
    const defaultEnabled = portfolioModule?.manifest.defaultEnabled ?? true;
    const portfolioEnabled = userPref?.enabled ?? defaultEnabled;
    
    setModuleEnabled(portfolioEnabled);
    
    if (!portfolioEnabled) {
      setLoading(false);
      return;
    }
    
    loadData();
    loadCashFlows();
    loadBatches();
  }, []);

  async function loadData() {
    try {
      setError(null);
      const res = await fetch('/api/portfolio/data');
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        setError(json.error || '加载失败');
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setError('网络错误，请重试');
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
    if (!csvFile || !csvAsOf) {
      setCsvValidationError('请输入文件和日期');
      return;
    }
    setCsvValidationError(null);

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('asOf', csvAsOf);

    try {
      const res = await fetch('/api/portfolio/import/csv?dryRun=1', {
        method: 'POST',
        body: formData,
      });
      
      const json = await res.json();
      if (res.ok) {
        setCsvPreview(json);
        setCsvErrors(json.errors || []);
      } else {
        setCsvErrors(json.errors || [{ row: 0, message: json.error }]);
        setCsvPreview(null);
      }
    } catch (error) {
      console.error('CSV dry-run failed:', error);
      setErrorMessage('CSV 预览失败');
    }
  }

  async function handleCSVImport() {
    if (!csvFile || !csvAsOf) {
      setCsvValidationError('请输入文件和日期');
      return;
    }
    setCsvValidationError(null);

    setImporting(true);

    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('asOf', csvAsOf);

    try {
      const res = await fetch('/api/portfolio/import/csv', {
        method: 'POST',
        body: formData,
      });
      
      const json = await res.json();
      if (res.ok) {
        if (json.alreadyImported) {
          setImportWarning({ message: json.message, batchId: json.batchId });
        } else {
          setSuccessMessage(`导入完成：${json.imported} 条`);
        }
        setCsvFile(null);
        setCsvPreview(null);
        setCsvErrors([]);
        loadData();
        loadBatches();
      } else {
        setCsvErrors(json.errors || [{ row: 0, message: json.error }]);
        setErrorMessage(`导入失败：${json.errors?.length || 0} 个错误`);
      }
    } catch (error) {
      console.error('CSV import failed:', error);
      setErrorMessage('CSV 导入失败');
    } finally {
      setImporting(false);
    }
  }

  async function handleRevertBatch(batchId: string) {
    try {
      const res = await fetch(`/api/portfolio/batches/${batchId}/revert`, {
        method: 'POST',
      });
      
      if (res.ok) {
        setSuccessMessage('批次已撤销');
        setRevertConfirm(null);
        loadBatches();
        loadData();
      } else {
        const json = await res.json();
        setErrorMessage(`撤销失败：${json.error}`);
      }
    } catch (error) {
      console.error('Revert batch failed:', error);
      setErrorMessage('批次撤销失败');
    }
  }

  async function handleSaveFxRate() {
    if (!editingFxRate || !data?.snapshots || data.snapshots.length === 0) return;

    const rate = parseFloat(fxRateInput);
    
    if (!fxRateInput || isNaN(rate) || rate <= 0) {
      setFxRateValidationError('请输入大于 0 的汇率');
      return;
    }

    setFxRateValidationError(null);
    setFxRateSaving(true);

    try {
      const res = await fetch(`/api/portfolio/snapshots/${editingFxRate.snapshotId}/fx`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currency: editingFxRate.currency, 
          rateToJpy: fxRateInput 
        }),
      });

      const json = await res.json();
      
      if (res.ok) {
        setFxRateSuccess({ currency: editingFxRate.currency, count: json.updatedCount });
        setEditingFxRate(null);
        setFxRateInput('');
        loadData();
      } else {
        setErrorMessage(`更新失败：${json.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to update FX rate:', error);
      setErrorMessage('更新汇率失败');
    } finally {
      setFxRateSaving(false);
    }
  }

  if (!moduleEnabled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground text-lg mb-4">持仓模块未开启</p>
          <Link
            href="/settings"
            className="inline-block px-6 py-3 bg-accent text-background rounded-lg hover:opacity-90 transition"
          >
            去设置开启
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">加载中...</p>
      </div>
    );
  }

  if (error) {
    const isDatabaseUnconfigured = error === '数据库未配置';
    
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-card-border">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
            <Link href="/" className="text-muted hover:text-foreground">
              ← 返回首页
            </Link>
            <h1 className="text-xl font-bold text-foreground">持仓管理</h1>
          </div>
        </header>

        <div className="flex items-center justify-center py-20">
          <div className="text-center max-w-md">
            <p className="text-down text-lg mb-4">{error}</p>
            {isDatabaseUnconfigured ? (
              <p className="text-sm text-muted">
                请在环境变量中配置 DATABASE_URL
              </p>
            ) : (
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  loadData();
                }}
                className="px-6 py-3 bg-accent text-background rounded-lg hover:opacity-90 transition"
              >
                重试
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  let totalValue = new Decimal(0);
  let totalCash = new Decimal(0);
  let missingFxCount = 0;
  
  if (data?.positions) {
    for (const { position, instrument } of data.positions) {
      const fxRateRaw = position.fxRateToJpy;
      
      if (!fxRateRaw || fxRateRaw === null) {
        missingFxCount++;
        continue;
      }
      
      const qty = new Decimal(position.quantity);
      const price = new Decimal(position.price);
      const fxRate = new Decimal(fxRateRaw);
      const unitBasis = new Decimal(instrument.unitBasis);
      
      totalValue = totalValue.plus(qty.times(price).div(unitBasis).times(fxRate));
    }
  }

  if (data?.cashBalances) {
    for (const { cash } of data.cashBalances) {
      const amount = new Decimal(cash.amount);
      const fxRateRaw = cash.fxRateToJpy;
      
      if (!fxRateRaw || fxRateRaw === null) {
        missingFxCount++;
        continue;
      }
      
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
  
  let xirr: Decimal | null = null;
  if (cashFlows.length > 0 && data?.snapshots && data.snapshots.length > 0) {
    const flows: Array<{ date: Date; amount: Decimal }> = cashFlows.map(({ cashFlow }) => ({
      date: new Date(cashFlow.date),
      amount: cashFlow.direction === 'deposit'
        ? new Decimal(cashFlow.amountJpy).neg()
        : new Decimal(cashFlow.amountJpy),
    }));
    
    const latestAsOf = data.snapshots[0].asOf;
    flows.push({
      date: new Date(latestAsOf),
      amount: totalValue,
    });
    
    xirr = calculateXIRR(flows);
  }

  const latestSnapshotId = data?.snapshots && data.snapshots.length > 0 ? data.snapshots[0].id : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-card-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-muted hover:text-foreground">
              ← 返回首页
            </Link>
            <h1 className="text-xl font-bold text-foreground">持仓管理</h1>
            {missingFxCount > 0 && (
              <span className="text-sm text-warn">
                缺少 {missingFxCount} 个汇率
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {successMessage && (
          <div className="mb-4 p-4 bg-up/10 border border-up/20 rounded-lg flex justify-between items-center">
            <p className="text-up">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="text-up hover:opacity-80">
              ✕
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 p-4 bg-down/10 border border-down/20 rounded-lg flex justify-between items-center">
            <p className="text-down">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="text-down hover:opacity-80">
              ✕
            </button>
          </div>
        )}

        {fxRateSuccess && (
          <div className="mb-4 p-4 bg-up/10 border border-up/20 rounded-lg flex justify-between items-center">
            <p className="text-up">已更新 {fxRateSuccess.count} 条 {fxRateSuccess.currency} 记录</p>
            <button onClick={() => setFxRateSuccess(null)} className="text-up hover:opacity-80">
              ✕
            </button>
          </div>
        )}

        {importWarning && (
          <div className="mb-4 p-4 bg-warn/10 border border-warn/20 rounded-lg">
            <p className="text-warn mb-3">{importWarning.message}</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setActiveTab('imports');
                  setImportWarning(null);
                }}
                className="px-4 py-2 bg-warn/20 text-warn rounded hover:bg-warn/30"
              >
                查看这批
              </button>
              <button
                onClick={() => setImportWarning(null)}
                className="px-4 py-2 bg-tile text-muted rounded hover:bg-card-border"
              >
                关闭
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-card bg-card-bg border border-card-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted mb-1">总资产</p>
              {missingFxCount > 0 && (
                <p className="text-xs text-warn">有 {missingFxCount} 条未计入</p>
              )}
            </div>
            <p className="text-2xl font-bold font-mono text-foreground">
              ¥{totalValue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            </p>
          </div>
          <div className="rounded-card bg-card-bg border border-card-border p-4">
            <p className="text-xs text-muted mb-1">累计盈亏</p>
            <p className={`text-2xl font-bold font-mono ${pnl.gte(0) ? 'text-up' : 'text-down'}`}>
              {pnl.gte(0) ? '+' : ''}¥{pnl.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            </p>
          </div>
          <div className="rounded-card bg-card-bg border border-card-border p-4">
            <p className="text-xs text-muted mb-1">年化 XIRR</p>
            {xirr ? (
              <p className={`text-2xl font-bold font-mono ${xirr.gte(0) ? 'text-up' : 'text-down'}`}>
                {xirr.times(100).toFixed(1)}%
              </p>
            ) : (
              <p className="text-sm text-muted">数据不足</p>
            )}
          </div>
          <div className="rounded-card bg-card-bg border border-card-border p-4">
            <p className="text-xs text-muted mb-1">现金</p>
            <p className="text-2xl font-bold font-mono text-foreground">
              ¥{totalCash.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            </p>
          </div>
        </div>

        <div className="mb-6 flex gap-4 border-b border-card-border">
          <button
            onClick={() => setActiveTab('positions')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'positions'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            持仓
          </button>
          <button
            onClick={() => setActiveTab('cashflows')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'cashflows'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            入出金
          </button>
          <button
            onClick={() => setActiveTab('snapshots')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'snapshots'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            快照历史
          </button>
          <button
            onClick={() => setActiveTab('imports')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'imports'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            导入记录
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="rounded-card bg-card-bg border border-card-border p-6">
              {activeTab === 'positions' && (
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-4">持仓列表</h3>
                  {data?.positions && data.positions.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-card-border text-muted">
                            <th className="text-left py-2">名称</th>
                            <th className="text-left py-2">代码</th>
                            <th className="text-right py-2">数量</th>
                            <th className="text-right py-2">现价</th>
                            <th className="text-right py-2">市值(JPY)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.positions.map((pos, i) => {
                            const fxRateRaw = pos.position.fxRateToJpy;
                            let marketValue = '缺汇率';
                            
                            if (fxRateRaw && fxRateRaw !== null) {
                              const value = new Decimal(pos.position.quantity)
                                .times(new Decimal(pos.position.price))
                                .div(new Decimal(pos.instrument.unitBasis))
                                .times(new Decimal(fxRateRaw));
                              marketValue = '¥' + value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                            }
                            
                            const isEditing = editingFxRate?.currency === pos.instrument.currency;
                            
                            return (
                              <tr key={i} className="border-b border-card-border">
                                <td className="py-3 text-foreground">{pos.instrument.name}</td>
                                <td className="py-3 text-muted">{pos.instrument.symbol}</td>
                                <td className="py-3 text-right font-mono text-foreground">
                                  {parseFloat(pos.position.quantity).toFixed(2)}
                                </td>
                                <td className="py-3 text-right font-mono text-foreground">
                                  {parseFloat(pos.position.price).toFixed(2)}
                                </td>
                                <td className="py-3 text-right">
                                  {fxRateRaw ? (
                                    <span className="font-mono text-foreground">{marketValue}</span>
                                  ) : isEditing ? (
                                    <div className="flex flex-col items-end gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted">1 {pos.instrument.currency} =</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={fxRateInput}
                                          onChange={(e) => {
                                            setFxRateInput(e.target.value);
                                            setFxRateValidationError(null);
                                          }}
                                          placeholder="0.00"
                                          className="w-20 px-2 py-1 text-xs bg-card-bg border border-card-border rounded text-foreground"
                                          autoFocus
                                          disabled={fxRateSaving}
                                        />
                                        <span className="text-xs text-muted">JPY</span>
                                        <button
                                          onClick={handleSaveFxRate}
                                          disabled={fxRateSaving}
                                          className="text-xs px-2 py-1 bg-accent text-background rounded hover:opacity-80 disabled:opacity-50"
                                        >
                                          {fxRateSaving ? '保存中…' : '保存'}
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingFxRate(null);
                                            setFxRateInput('');
                                            setFxRateValidationError(null);
                                          }}
                                          disabled={fxRateSaving}
                                          className="text-xs px-2 py-1 bg-tile text-muted rounded hover:bg-card-border disabled:opacity-50"
                                        >
                                          取消
                                        </button>
                                      </div>
                                      {fxRateValidationError && (
                                        <p className="text-xs text-down">{fxRateValidationError}</p>
                                      )}
                                      <p className="text-xs text-muted">将用于本快照所有 {pos.instrument.currency} 持仓和现金</p>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-end gap-2 text-warn">
                                      <span>缺少汇率，未计入总资产</span>
                                      {latestSnapshotId && (
                                        <button
                                          onClick={() => {
                                            setEditingFxRate({ snapshotId: latestSnapshotId, currency: pos.instrument.currency });
                                            setFxRateInput('');
                                            setFxRateValidationError(null);
                                          }}
                                          className="text-xs px-2 py-1 bg-accent text-background rounded hover:opacity-80 whitespace-nowrap"
                                        >
                                          补汇率
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted mb-4">还没有持仓数据</p>
                      <p className="text-sm text-muted">日本持仓可用 CSV 导入，美股发截图给 Grok</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'cashflows' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-foreground">入出金记录</h3>
                    <button
                      onClick={() => setShowNewCashFlowForm(true)}
                      className="px-3 py-1 text-sm bg-accent text-background rounded hover:opacity-90"
                    >
                      ＋ 新增
                    </button>
                  </div>
                  
                  {showNewCashFlowForm && (
                    <div className="mb-4 p-4 bg-tile rounded-lg">
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="date"
                          value={newCashFlow.date}
                          onChange={(e) => setNewCashFlow({ ...newCashFlow, date: e.target.value })}
                          className="px-3 py-2 bg-card-bg border border-card-border rounded text-foreground"
                        />
                        <select
                          value={newCashFlow.direction}
                          onChange={(e) => setNewCashFlow({ ...newCashFlow, direction: e.target.value as any })}
                          className="px-3 py-2 bg-card-bg border border-card-border rounded text-foreground"
                        >
                          <option value="deposit">入金</option>
                          <option value="withdrawal">出金</option>
                        </select>
                        <input
                          type="text"
                          placeholder="金额 (JPY)"
                          value={newCashFlow.amountJpy}
                          onChange={(e) => setNewCashFlow({ ...newCashFlow, amountJpy: e.target.value })}
                          className="px-3 py-2 bg-card-bg border border-card-border rounded text-foreground"
                        />
                        <input
                          type="text"
                          placeholder="备注"
                          value={newCashFlow.note}
                          onChange={(e) => setNewCashFlow({ ...newCashFlow, note: e.target.value })}
                          className="px-3 py-2 bg-card-bg border border-card-border rounded text-foreground"
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleCreateCashFlow}
                          className="px-4 py-2 bg-accent text-background rounded hover:opacity-90"
                        >
                          保存
                        </button>
                        <button
                          onClick={() => setShowNewCashFlowForm(false)}
                          className="px-4 py-2 bg-tile text-muted rounded hover:bg-card-border"
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
                          <tr className="border-b border-card-border text-muted">
                            <th className="text-left py-2">日期</th>
                            <th className="text-left py-2">类型</th>
                            <th className="text-right py-2">金额(JPY)</th>
                            <th className="text-left py-2">备注</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cashFlows.map(({ cashFlow }, i) => (
                            <tr key={i} className="border-b border-card-border">
                              <td className="py-3 text-foreground">{cashFlow.date}</td>
                              <td className="py-3">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  cashFlow.direction === 'deposit' 
                                    ? 'bg-up/10 text-up'
                                    : 'bg-down/10 text-down'
                                }`}>
                                  {cashFlow.direction === 'deposit' ? '入金' : '出金'}
                                </span>
                              </td>
                              <td className="py-3 text-right font-mono text-foreground">
                                ¥{parseFloat(cashFlow.amountJpy).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                              </td>
                              <td className="py-3 text-muted">{cashFlow.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted">还没有入出金记录</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'snapshots' && (
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-4">快照历史</h3>
                  {data?.snapshots && data.snapshots.length > 0 ? (
                    <div className="space-y-3">
                      {data.snapshots.map((snapshot, i) => (
                        <div key={i} className="p-3 bg-tile rounded">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-foreground">{snapshot.asOf}</p>
                              <p className="text-xs text-muted">来源: {snapshot.source}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted">还没有快照</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'imports' && (
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-4">导入记录</h3>
                  {batches.length > 0 ? (
                    <div className="space-y-3">
                      {batches.map((batch) => (
                        <div key={batch.id} className="p-4 bg-tile rounded">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-foreground">{batch.filename || '手动录入'}</p>
                              <p className="text-xs text-muted">
                                {new Date(batch.createdAt).toLocaleString()} · {batch.rowCount} 行 · {batch.source}
                              </p>
                              <span className={`inline-block mt-2 px-2 py-1 rounded text-xs ${
                                batch.status === 'committed' 
                                  ? 'bg-up/10 text-up'
                                  : 'bg-down/10 text-down'
                              }`}>
                                {batch.status === 'committed' ? '已提交' : '已撤销'}
                              </span>
                            </div>
                            {batch.status === 'committed' && (
                              <div>
                                {revertConfirm === batch.id ? (
                                  <div className="flex flex-col gap-2">
                                    <p className="text-xs text-muted mb-1">确定要撤销此批次吗？</p>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleRevertBatch(batch.id)}
                                        className="px-3 py-1 text-xs bg-down/20 text-down rounded hover:bg-down/30"
                                      >
                                        确认撤销
                                      </button>
                                      <button
                                        onClick={() => setRevertConfirm(null)}
                                        className="px-3 py-1 text-xs bg-tile text-muted rounded hover:bg-card-border"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setRevertConfirm(batch.id)}
                                    className="px-3 py-1 text-sm bg-down/10 text-down rounded hover:bg-down/20"
                                  >
                                    撤销
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted">还没有导入记录</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-card bg-card-bg border border-card-border p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">更新数据</h3>
              
              <div className="mb-6">
                <h4 className="text-sm font-medium text-foreground mb-3">CSV 导入</h4>
                
                {csvValidationError && (
                  <div className="mb-3 p-2 bg-down/10 border border-down/20 rounded text-xs text-down">
                    {csvValidationError}
                  </div>
                )}
                
                <div className="space-y-3">
                  {/* 自定义拖放区域 */}
                  <label
                    htmlFor="csv-file-input"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const files = e.dataTransfer.files;
                      if (files.length > 0) {
                        setCsvFile(files[0]);
                        setCsvPreview(null);
                        setCsvErrors([]);
                      }
                    }}
                    className={`
                      block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                      transition-colors focus-within:ring-2 focus-within:ring-accent
                      ${isDragging 
                        ? 'border-accent bg-accent/5' 
                        : 'border-card-border bg-tile hover:border-accent/50'
                      }
                    `}
                  >
                    <input
                      id="csv-file-input"
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setCsvFile(file);
                          setCsvPreview(null);
                          setCsvErrors([]);
                        }
                      }}
                      className="sr-only"
                    />
                    <div className="space-y-2">
                      <p className="text-sm text-foreground">
                        拖入 SBI 保有証券 CSV，或点击选择文件
                      </p>
                      <p className="text-xs text-muted">
                        SBI：口座管理 &gt; 保有証券 &gt; CSV ダウンロード（仅日本持仓）
                      </p>
                      {csvFile && (
                        <p className="text-xs text-accent mt-2">
                          ✓ {csvFile.name}
                        </p>
                      )}
                    </div>
                  </label>
                  
                  <div>
                    <label className="block text-xs text-muted mb-1">快照日期</label>
                    <input
                      type="date"
                      value={csvAsOf}
                      onChange={(e) => setCsvAsOf(e.target.value)}
                      className="w-full px-3 py-2 bg-card-bg border border-card-border rounded text-foreground"
                    />
                  </div>
                  
                  <button
                    onClick={handleCSVDryRun}
                    disabled={!csvFile}
                    className="w-full px-4 py-2 bg-tile text-muted rounded hover:bg-card-border disabled:opacity-50"
                  >
                    预览
                  </button>
                  
                  {csvPreview && csvPreview.accountSummaries && (
                    <div className="p-3 bg-tile rounded space-y-2">
                      <p className="text-xs text-muted mb-2">
                        共 {csvPreview.totalRows} 条，按账户：
                      </p>
                      {csvPreview.accountSummaries.map((summary: any, i: number) => (
                        <div key={i} className="text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-foreground">{summary.accountName}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-muted">{summary.count} 条</span>
                              <span className="text-muted">¥{parseFloat(summary.totalValueJpy).toLocaleString()}</span>
                              {summary.matchesFile ? (
                                <span className="text-up">✓</span>
                              ) : (
                                <span className="text-down">✗</span>
                              )}
                            </div>
                          </div>
                          {!summary.matchesFile && (
                            <p className="text-xs text-down mt-1">✗ 与文件小计不符</p>
                          )}
                        </div>
                      ))}
                      
                      <p className="text-xs text-muted pt-2 border-t border-card-border">
                        将更新以上 {csvPreview.accountSummaries.length} 个账户的持仓，其他账户（如美股）不变
                      </p>
                      
                      {csvErrors.length === 0 && csvPreview.totalRows > 0 ? (
                        <button
                          onClick={handleCSVImport}
                          disabled={importing}
                          className="w-full px-4 py-2 bg-accent text-background rounded hover:opacity-90 disabled:opacity-50 mt-3"
                        >
                          {importing ? '导入中...' : '导入'}
                        </button>
                      ) : (
                        <div className="mt-3">
                          {csvPreview.totalRows === 0 ? (
                            <p className="text-xs text-muted mb-1">没有可导入的持仓</p>
                          ) : (
                            <p className="text-xs text-down mb-1">有错误，无法导入</p>
                          )}
                          <button
                            disabled
                            className="w-full px-4 py-2 bg-tile text-muted rounded opacity-50 cursor-not-allowed"
                          >
                            导入
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {csvErrors.length > 0 && (
                    <div className="p-3 bg-down/10 rounded text-xs space-y-1">
                      {csvErrors.map((err, i) => (
                        <p key={i} className="text-down">
                          {err.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-sm font-medium text-foreground mb-2">截图识别</h4>
                <div className="bg-tile rounded-lg p-3 text-xs text-muted space-y-2">
                  <p>美股等外国株用截图：SBI 外国株式 &gt; 保有証券，截图发给 Grok</p>
                  <p className="text-xs text-muted">会先列表给你核对，确认后才写入</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">新增账户</h4>
                {showNewAccountForm ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="账户名"
                      value={newAccount.name}
                      onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                      className="w-full px-3 py-2 bg-card-bg border border-card-border rounded text-foreground"
                    />
                    <select
                      value={newAccount.type}
                      onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}
                      className="w-full px-3 py-2 bg-card-bg border border-card-border rounded text-foreground"
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
                        className="flex-1 px-4 py-2 bg-accent text-background rounded hover:opacity-90"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setShowNewAccountForm(false)}
                        className="flex-1 px-4 py-2 bg-tile text-muted rounded hover:bg-card-border"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewAccountForm(true)}
                    className="w-full px-4 py-2 bg-accent text-background rounded-lg hover:opacity-90 transition-colors"
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
