import React from "react";
import { AppContext } from "../contexts";
import App from "./App";
import { RawModeProvider } from "../contexts";
import { ErrorBoundary } from "../components/ErrorBoundary";

const AppContainer: React.FC<{
  projectRoot: string;
  version: string;
  initialPrompt: string | undefined;
  autoAccept?: boolean;
  planMode?: boolean;
  maxTurns?: number;
  headless?: boolean;
  onRestart: () => void;
  teamMode?: boolean;
  teamConfig?: { mode?: string; maxParallelWorkers?: number };
}> = ({
  version,
  projectRoot,
  initialPrompt,
  autoAccept,
  planMode,
  maxTurns,
  headless,
  onRestart,
  teamMode,
  teamConfig,
}) => {
  return (
    <AppContext.Provider value={{ version: version }}>
      <RawModeProvider>
        <ErrorBoundary>
          <App
            initialPrompt={initialPrompt}
            projectRoot={projectRoot}
            autoAccept={autoAccept ?? false}
            planMode={planMode ?? false}
            maxTurns={maxTurns ?? 25}
            headless={headless ?? false}
            onRestart={onRestart}
            teamMode={teamMode ?? false}
            teamConfig={teamConfig}
          />
        </ErrorBoundary>
      </RawModeProvider>
    </AppContext.Provider>
  );
};

export default AppContainer;
