import React from 'react';
import { Button, Input, Table } from '@itwin/itwinui-react';

export function DevTokensRoute(): React.JSX.Element {
  return (
    <div data-testid="dev-tokens-route" style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Button styleType="high-visibility">主按钮</Button>
      <Button>次按钮</Button>
      <Button disabled>禁用</Button>
      <Input placeholder="输入框样张" />
      <Table
        columns={[{ id: 'name', Header: '名称', accessor: 'name' }]}
        data={[{ name: '样例行' }]}
        emptyTableContent="空态样张"
      />
    </div>
  );
}
