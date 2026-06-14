import React from "react";
import { Text, Box } from "ink";

type Props = {
  children: React.ReactNode;
  onError?: (error: Error) => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onError?.(error);
    process.stderr.write(`[anng] UI Error: ${error.message}\n${info.componentStack ?? ""}\n`);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" padding={1} borderStyle="round" borderColor="red">
          <Text bold color="red">
            Something went wrong
          </Text>
          <Text dimColor>{this.state.error?.message ?? "Unknown error"}</Text>
          <Text>Press Ctrl+D to exit, or restart the CLI.</Text>
        </Box>
      );
    }
    return this.props.children;
  }
}
