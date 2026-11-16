import { createContext, useContext } from 'react';

export type SettingsTab = 'preferences' | 'security' | 'integrations' | 'automation' | 'backup';

export const WorkspaceContext = createContext({
  search: '',
  setSearch: (_value: string) => {
    void _value;
  },
  newSubscription: () => {},
  newAccount: () => {},
  newDomain: () => {},
  newIp: () => {},
  newServer: () => {},
  openSettings: (_tab?: SettingsTab) => {
    void _tab;
  },
  openCommandPalette: () => {},
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
