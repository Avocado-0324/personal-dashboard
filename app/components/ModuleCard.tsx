'use client';

import { useState } from 'react';
import type { ModuleLoadResult, ModuleId } from '@/lib/module-types';

type Props = {
  moduleId: ModuleId;
  initialResult: ModuleLoadResult<any>;
  Card: React.ComponentType<{ result: ModuleLoadResult<any>; onRefresh: () => void }>;
};

export function ModuleCard({ moduleId, initialResult, Card }: Props) {
  const [result, setResult] = useState(initialResult);

  const handleRefresh = () => {
    // M0: 刷新功能暂时重新加载页面
    // M1+: 实现客户端API调用
    window.location.reload();
  };

  return <Card result={result} onRefresh={handleRefresh} />;
}
