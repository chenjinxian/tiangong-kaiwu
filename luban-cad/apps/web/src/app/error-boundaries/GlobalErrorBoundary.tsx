import React from 'react';

interface State { error: Error | null; }

export class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  public override state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public override render(): React.ReactNode {
    if (this.state.error) {
      return <div role="alert" style={{ padding: 24 }}>应用出错：{this.state.error.message}</div>;
    }
    return this.props.children;
  }
}
